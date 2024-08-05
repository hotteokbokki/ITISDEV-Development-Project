const convert = require('convert-units');
const express = require('express');
const flash = require('express-flash');
const session = require('express-session');
const app = express();
const dotenv = require('dotenv');
const bcrypt = require('bcrypt');
const passport = require('passport');
const cookieParser = require('cookie-parser');
const methodOverride = require('method-override');
const KNN = require('ml-knn');
const LinearRegression = require('ml-regression').SimpleLinearRegression;

dotenv.config();

const path = require('path');
const authRoutes = require('./routes/authRoutes');
const userRoutes = require('./routes/userRoutes');

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(cookieParser());
app.use(flash());

app.use(session({
  secret: process.env.SESSION_SECRET, 
  resave: false,
  saveUninitialized: true,
}));

app.use(passport.initialize());
app.use(passport.session());
app.use(methodOverride('_method'));
require('./passport-config');

// Set up your Supabase connection
const { createClient } = require('@supabase/supabase-js');

// Controller imports
const { getUserlist, createUsers, toggleUserActivation } = require('./controllers/userController');
const {insertRawMatOut, getRawMatsOut_Reason, getRawMaterialsOutByID, insertRawMatOutMissing, insertRawMatOutExpired, getRawMatsOutKNN} = require ('./controllers/rawMaterialsOut.js');
const { getRoles } = require('./controllers/positionController');
const { checkMaterialExists, updateMaterialQuantity, insertMaterialPurchasing, insertNewMaterial, getRawMaterialsPurchasingByID, getNameByID, searchByNameRawMaterials, searchByDate, getIDByName, getRawMaterialsData, searchUsageByDate} = require('./controllers/rawMaterialsControllers');
const { getUnitMeasures } = require('./controllers/unitMeasureController');
const { getAllChemicals, insertNewChemical, getChemicalProductID, checkRecipeExists, insertRecipe, getMaterialIDByName, insertNewMaterialAndGetID } = require('./controllers/chemicalController');
const { getRawMaterialName } = require('./controllers/rawMaterialsControllers.js');
const { insertDiscrepancyReport, getDiscrepancyReports } = require('./controllers/reports.js');
const { insertOrder, getChemicalData, getRecipeData, updateRawMaterialQuantity, recordRawMaterialOutflow, calculateNewRawMaterialQuantity, getMaterialData } = require('./controllers/orderController.js');
const { from } = require('./supabase.js');
const { error } = require('console');
const { name } = require('ejs');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

// Connections for postgres
const { Pool } = require('pg');
const connectionString = 'postgres://postgres.hgxwsxbnkvthlbhdespj:!12345itisdeV@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres';

const pool = new Pool({
  connectionString: connectionString,
  connectionTimeoutMillis: 10000, // 10 seconds
  idleTimeoutMillis: 30000, // 30 seconds
  max: 20 // Maximum number of clients in the pool
});

pool.on('error', (err) => {
  console.error('Unexpected error on idle client', err);
  process.exit(-1);
});

const supabase = createClient(supabaseUrl, supabaseKey);

app.set('view engine', 'ejs');

// Serve static files from the 'controllers' directory
app.use('/controllers', express.static(__dirname + '/controllers', {
  setHeaders: (res, path, stat) => {
    if (path.endsWith('.js')) {
      res.set('Content-Type', 'text/javascript');
    }
  }
}));

app.use('/auth', authRoutes);
app.use('/users', userRoutes);
app.use(express.static('views')); 
app.set('views', path.join(__dirname, 'views')); 

const PORT = process.env.PORT || 3000;

const convertToStandardUnit = (quantity, unit) => {
  if (['g', 'mg', 'kg', 'oz', 'lb'].includes(unit)) {
    return convert(quantity).from(unit).to('g');
  } else if (['ml', 'l', 'tsp', 'Tbs', 'fl-oz', 'cup', 'pnt', 'qt', 'gal'].includes(unit)) {
    return convert(quantity).from(unit).to('ml');
  } else {
    throw new Error(`Unknown unit: ${unit}`);
  }
};

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});

function checkAuthenticated(req, res, next) {
  if (req.isAuthenticated()) {
    return next();
  }
  res.redirect('/signin');
}

function checkNotAuthenticated(req, res, next) {
  if (req.isAuthenticated()) {
    return res.redirect('/');
  }
  next();
}

function checkRole(allowedRoles) {
  return function(req, res, next) {
    if (req.isAuthenticated() && allowedRoles.includes(req.user.position)) {
      return next();
    }
    const scriptRestrict = `
      <script>
        alert("You do not have permission to access that page.");
        window.location.href = "/dashboard";
      </script>
    `;
    res.send(scriptRestrict);
  };
}

function checkAdminAuthenticated(req, res, next) {
  if (req.isAuthenticated() && req.user.position === 'Admin') {
    return next();
  }
  const scriptUserRestrict = `
      <script>
        alert("You do not have permission to access that page.");
        window.location.href = "/dashboard";
      </script>
    `;
  res.send(scriptUserRestrict);
}

// Get standardized unit for material quantities
function getStandardizedUnit(data, unit) {
  let conversionData;

  // Convert to 'ml' if unit is volume, 'g' if it's mass
  if (['ml', 'l', 'tsp', 'Tbs', 'fl-oz', 'cup', 'pnt', 'qt', 'gal'].includes(unit)) {
    conversionData = convert(data).from(unit).to('ml');
  } else if (['mcg', 'mg', 'g', 'kg', 'oz', 'lb'].includes(unit)) {
    conversionData = convert(data).from(unit).to('g');
  }

  return conversionData;
}

// Calculate total quantities for each material name
function calculateTotalQuantities(purchases) {
  const materialQuantities = new Map();

  // Iterate through purchases to calculate total quantities
  for (const purchase of purchases) {
    const { materialName, no_of_materials, unit_Measure } = purchase;

    // Convert the no_of_materials to a standardized unit
    const standardizedQuantity = getStandardizedUnit(no_of_materials, unit_Measure);

    if (!materialQuantities.has(materialName)) {
      materialQuantities.set(materialName, { totalQuantity: 0, unitMeasure: unit_Measure });
    }
    // Add the current purchase quantity to the total quantity for the material
    const currentQuantity = materialQuantities.get(materialName).totalQuantity;
    materialQuantities.set(materialName, {
      totalQuantity: currentQuantity + standardizedQuantity,
      unitMeasure: unit_Measure
    });
  }
  
  return materialQuantities;
}

function createNewRecord(materialQuantities) {
  const newRecords = [];
  let standardUnit;

  // Iterate through material quantities map
  for (const [materialName, { totalQuantity, unitMeasure }] of materialQuantities.entries()) {
    // Convert to 'ml' if unit is volume, 'g' if it's mass
    if (['ml', 'l', 'tsp', 'Tbs', 'fl-oz', 'cup', 'pnt', 'qt', 'gal'].includes(unitMeasure)) {
      standardUnit = 'ml';
    } else if (['mcg', 'mg', 'g', 'kg', 'oz', 'lb'].includes(unitMeasure)) {
      standardUnit = 'g';
    }
    // Create a new record object
    const newRecord = {
      materialName: materialName,
      unit_Measure: standardUnit,
      no_of_materials: totalQuantity // Accumulated total no_of_materials
    };
    // Push the new record to the array
    newRecords.push(newRecord);
  }

  console.log("New record data: ", newRecords);

  return newRecords;
}

// ================ GET ROUTES ==================

app.get('/', checkAuthenticated, (req, res) => {
  res.redirect('/dashboard');
});

app.get('/dashboard', checkAuthenticated, checkRole(['Admin', 'Stock Controller', 'Manufacturer']), async (req, res) => {
  try {
    const { data: orders, error } = await supabase
      .from('orders')
      .select('productID, order_quantity')
      .order('productID');

    const { data: rawMaterials, rawMaterialsError } = await supabase
      .from('raw_Materials')
      .select('name, quantity, unit_Measure');

    if (error || rawMaterialsError) {
      console.error('Error fetching data:', error || rawMaterialsError);
      res.status(500).json({ error: 'Internal Server Error' });
      return;
    }

    const aggregatedOrders = orders.reduce((acc, order) => {
      if (!acc[order.productID]) {
        acc[order.productID] = 0;
      }
      acc[order.productID] += order.order_quantity;
      return acc;
    }, {});

    const chemicalNamesPromises = Object.keys(aggregatedOrders).map(async (productId) => {
      const { data: chemicalNameData, error: nameError } = await supabase
        .from('chemicals')
        .select('chemical_Name')
        .eq('productID', productId)
        .single();

      if (nameError) {
        console.error('Error fetching chemical name for productID:', productId, nameError.message);
        return null;
      }

      return {
        productID: productId,
        chemicalName: chemicalNameData ? chemicalNameData.chemical_Name : 'Unknown',
        totalOrders: aggregatedOrders[productId]
      };
    });

    const lowStockChemicals = rawMaterials
      .filter(material => {
        return (
          (material.unit_Measure === 'g' && material.quantity < 10000) ||
          (material.unit_Measure === 'ml' && material.quantity < 5000)
        );
      })
      .sort((a, b) => a.quantity - b.quantity);

    const chemicalNamesWithOrders = await Promise.all(chemicalNamesPromises);

    const filteredChemicalNames = chemicalNamesWithOrders.filter(item => item !== null);
    const sortedChemicalNames = filteredChemicalNames.sort((a, b) => b.totalOrders - a.totalOrders);

    res.render('dashboard', {
      chemicalData: sortedChemicalNames,
      lowStockChemicals: lowStockChemicals,
      userRole: req.user.position
    });
  } catch (error) {
    console.error('Error handling /dashboard request:', error.message);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

app.get('/view_chemical_list', checkAuthenticated, checkRole(['Admin', 'Stock Controller', 'Manufacturer', 'Sales']), async (req, res) => {
  const chemicalData = await getAllChemicals();
  res.render('view_chemical_list', {chemicals: chemicalData, userRole: req.user.position} );
});

app.get('/view_missing_report', checkAuthenticated, checkRole(['Admin', 'Stock Controller']), async (req, res) => {
  const DiscrepancyReports = await getDiscrepancyReports();
  res.render('view_missing_report', {reports: DiscrepancyReports, userRole: req.user.position} );
});

app.get('/create_order', checkAuthenticated, checkRole(['Admin', 'Stock Controller']), async (req, res) => {
  try {
    const chemicalData = await getAllChemicals(); 
    const unitMeasureList = await getUnitMeasures();
    res.render('create_order', { chemicals: chemicalData, units: unitMeasureList, userRole: req.user.position });
  } catch (error) {
    console.error("Error fetching chemical data:", error);
    res.status(500).send("Internal Server Error");
  }
});

app.get('/materials_for_chemical', async (req, res) => {
  try {
    const { chemical_Name, quantity } = req.query;

    const chemicalData = await getChemicalData(chemical_Name);
    if (!chemicalData || chemicalData.length === 0) {
      return res.status(404).json({ message: 'Chemical not found' });
    }
    const productID = chemicalData[0].productID;

    const recipes = await getRecipeData(productID);
    if (!recipes) {
      return res.status(404).json({ message: 'Recipe not found for the chemical' });
    }

    const materials = await Promise.all(recipes.map(async (recipe) => {
      const materialData = await getMaterialData(recipe.materialID);
      return {
        name: materialData.name,
        quantity: recipe.quantity * quantity,
        unitMeasure: recipe.unit_Measure
      };
    }));

    res.json(materials);
  } catch (error) {
    console.error('Error fetching materials:', error);
    res.status(500).send('Error fetching materials');
  }
});

app.get('/signin', checkNotAuthenticated, (req, res) => {
  res.render('signin');
});

app.get('/signup', checkAdminAuthenticated, async (req, res) => {
  try {
    const roles = await getRoles();
    res.render('signup', { roles: roles });
  } catch (error) {
    console.error('Error fetching roles:', error.message);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

app.get('/view_analytics', checkAuthenticated, checkRole(['Admin', 'Stock Controller','Manufacturer']), async (req, res) => {
  try {
    const { data: orders, error } = await supabase
      .from('orders')
      .select('productID, order_quantity')
      .order('productID');

    const { data: rawMaterials, rawMaterialsError } = await supabase
      .from('raw_Materials')
      .select('name, quantity, unit_Measure');

    if (error || rawMaterialsError) {
      console.error('Error fetching data:', error || rawMaterialsError);
      res.status(500).json({ error: 'Internal Server Error' });
      return;
    }

    const aggregatedOrders = orders.reduce((acc, order) => {
      if (!acc[order.productID]) {
        acc[order.productID] = 0;
      }
      acc[order.productID] += order.order_quantity;
      return acc;
    }, {});

    const chemicalNamesPromises = Object.keys(aggregatedOrders).map(async (productId) => {
      const { data: chemicalNameData, error: nameError } = await supabase
        .from('chemicals')
        .select('chemical_Name')
        .eq('productID', productId)
        .single();

      if (nameError) {
        console.error('Error fetching chemical name for productID:', productId, nameError.message);
        return null;
      }

      return {
        productID: productId,
        chemicalName: chemicalNameData ? chemicalNameData.chemical_Name : 'Unknown',
        totalOrders: aggregatedOrders[productId]
      };
    });

    const lowStockChemicals = rawMaterials
      .filter(material => {
        return (
          (material.unit_Measure === 'g' && material.quantity < 10000) ||
          (material.unit_Measure === 'ml' && material.quantity < 5000)
        );
      })
      .sort((a, b) => a.quantity - b.quantity);

    const chemicalNamesWithOrders = await Promise.all(chemicalNamesPromises);

    const filteredChemicalNames = chemicalNamesWithOrders.filter(item => item !== null);
    const sortedChemicalNames = filteredChemicalNames.sort((a, b) => b.totalOrders - a.totalOrders);

    res.render('view_analytics', {
      chemicalData: sortedChemicalNames,
      lowStockChemicals: lowStockChemicals,
      userRole: req.user.position
    });
  } catch (error) {
    console.error('Error handling /view_analytics request:', error.message);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

app.get('/inventory', checkAuthenticated, (req, res) => {
  res.render('inventory', { userRole: req.user.position });
});

// Sample route to check database connection
app.get('/inDemandChemicals', async (req, res) => {
  try {
    const result = await pool.query(`
                  select
                    c."chemical_Name",
                    o."productID",
                    sum(o."order_quantity") as accumulatedOrderQuantity
                  from
                    orders as o
                    join chemicals as c on c."productID" = o."productID"
                  group by
                    c."chemical_Name",
                    o."productID"
                  order by
                    accumulatedOrderQuantity desc
                  limit
                    5;
    `);
    res.json(result.rows);
  } catch (error) {
    console.error('Error executing query', error);
    res.status(500).send('Server Error');
  }
});

app.get('/compute_wma', async (req, res) => {
  const days = parseInt(req.query.days);

  const currentDate = new Date();
  const pastDate = new Date();
  pastDate.setDate(currentDate.getDate() - days);

  const currentDateString = currentDate.toISOString().split('T')[0];
  const pastDateString = pastDate.toISOString().split('T')[0];

  try {
    const materials = await getRawMaterialsData();

    const queryOut = `
      SELECT "materialID", "no_of_materials", "unit_Measure", "date"
      FROM "rawMaterials_Out"
      WHERE "date" >= $1
        AND "date" <= $2;
    `;

    const queryIn = `
      SELECT "materialID", "no_of_materials", "unit_Measure", "date_Purchased"
      FROM "rawMaterials_purchasing"
      WHERE "date_Purchased" >= $1
        AND "date_Purchased" <= $2;
    `;

    const { rows: rawMatsOutData } = await pool.query(queryOut, [pastDateString, currentDateString]);
    const { rows: rawMatsInData } = await pool.query(queryIn, [pastDateString, currentDateString]);

    const predictions = await Promise.all(materials.map(async (material) => {
      const materialID = material.materialID;
      const materialOutData = rawMatsOutData.filter(item => item.materialID === materialID);
      const materialInData = rawMatsInData.filter(item => item.materialID === materialID);

      const rawInQuantities = materialInData.map(item => convertToStandardUnit(item.no_of_materials, item.unit_Measure));
      const rawOutQuantities = materialOutData.map(item => convertToStandardUnit(item.no_of_materials, item.unit_Measure));

      const totalDays = rawInQuantities.length;

      if (totalDays > 0) {
        let wmaIn = 0;
        let wmaOut = 0;
        let sumWeights = 0;

        for (let i = 0; i < totalDays; i++) {
          const weight = totalDays - i;
          wmaIn += rawInQuantities[i] * weight;
          wmaOut += rawOutQuantities[i] * weight;
          sumWeights += weight;
        }

        wmaIn /= sumWeights;
        wmaOut /= sumWeights;

        const prediction = wmaIn - wmaOut;

        return { materialID, name: material.name, unitMeasure: material.unit_Measure, prediction };
      } else {
        return { materialID, name: material.name, unitMeasure: material.unit_Measure, prediction: 'Not enough data' };
      }
    }));

    res.json(predictions);
  } catch (error) {
    console.error('Error executing query', error.message);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

app.get('/compute_SD', async (req, res) => {
  try {
    const days = parseInt(req.query.days); 

    const currentDate = new Date();
    const pastDate = new Date();
    pastDate.setDate(currentDate.getDate() - days);

    const currentDateString = currentDate.toISOString().split('T')[0];
    const pastDateString = pastDate.toISOString().split('T')[0];

    const materials = await getRawMaterialsData();

    const queryOut = `
      SELECT "materialID", "no_of_materials", "unit_Measure", "date"
      FROM "rawMaterials_Out"
      WHERE "date" >= $1 AND "date" <= $2;
    `;
    const { rows: rawMatsOutData } = await pool.query(queryOut, [pastDateString, currentDateString]);

    const predictions = await Promise.all(materials.map(async (material) => {
      const materialID = material.materialID;
      const materialOutData = rawMatsOutData.filter(item => item.materialID === materialID);


      if (materialOutData.length < 2) { 
        return { materialID, name: material.name, unitMeasure: material.unit_Measure, prediction: 'Not enough data' };
      }

      const timeseriesData = materialOutData.map(item => ({
        date: new Date(item.date),
        value: convertToStandardUnit(item.no_of_materials, item.unit_Measure)
      }));

      timeseriesData.sort((a, b) => a.date - b.date);
      const values = timeseriesData.map(item => item.value);
      const dates = timeseriesData.map((item, index) => index);

      const regression = new LinearRegression(dates, values);
      const trend = dates.map(date => regression.predict(date));

      const seasonLength = Math.min(365, values.length);
      const detrended = values.map((value, index) => value - trend[index]);
      const seasonal = new Array(seasonLength).fill(0).map((_, i) =>
        detrended.filter((_, index) => index % seasonLength === i).reduce((a, b) => a + b, 0) /
        Math.floor(detrended.length / seasonLength)
      );

      const lastTrend = trend[trend.length - 1];
      const lastSeasonal = seasonal[timeseriesData.length % seasonLength] || 0;
      const prediction = lastTrend + lastSeasonal;

      return { materialID, name: material.name, unitMeasure: material.unit_Measure, prediction };
    }));

    res.json(predictions);
  } catch (error) {
    console.error('Error computing seasonal decomposition:', error.message);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});



app.get('/compute_KNN', async (req, res) => {
  const days = parseInt(req.query.days);

  const currentDate = new Date();
  const pastDate = new Date();
  pastDate.setDate(currentDate.getDate() - days);

  const currentDateString = currentDate.toISOString().split('T')[0];
  const pastDateString = pastDate.toISOString().split('T')[0];

  try {
    const materials = await getRawMaterialsData();

    const queryOut = `
      SELECT "materialID", "no_of_materials", "unit_Measure", "date"
      FROM "rawMaterials_Out"
      WHERE "date" >= $1
        AND "date" <= $2;
    `;

    const queryIn = `
      SELECT "materialID", "no_of_materials", "unit_Measure", "date_Purchased"
      FROM "rawMaterials_purchasing"
      WHERE "date_Purchased" >= $1
        AND "date_Purchased" <= $2;
    `;

    const { rows: rawMatsOutData } = await pool.query(queryOut, [pastDateString, currentDateString]);
    const { rows: rawMatsInData } = await pool.query(queryIn, [pastDateString, currentDateString]);

    const predictions = await Promise.all(materials.map(async (material) => {
      const materialID = material.materialID;
      const materialOutData = rawMatsOutData.filter(item => item.materialID === materialID);
      const materialInData = rawMatsInData.filter(item => item.materialID === materialID);

      const rawInQuantities = materialInData.map(item => convertToStandardUnit(item.no_of_materials, item.unit_Measure));
      const rawOutQuantities = materialOutData.map(item => convertToStandardUnit(item.no_of_materials, item.unit_Measure));

      const X = rawInQuantities.map((inQty, idx) => [inQty, rawOutQuantities[idx]]);
      const y = rawInQuantities.map((inQty, idx) => inQty - rawOutQuantities[idx]);

      if (X.length > 0 && y.length > 0) {
        const knn = new KNN(X, y);

        // Assuming you want to predict for the average of newRawIn and newRawOut in the data
        const avgRawIn = rawInQuantities.reduce((a, b) => a + b, 0) / rawInQuantities.length;
        const avgRawOut = rawOutQuantities.reduce((a, b) => a + b, 0) / rawOutQuantities.length;

        const prediction = knn.predict([avgRawIn, avgRawOut]);

        return { materialID, name: material.name, unitMeasure: material.unit_Measure, prediction };
      } else {
        return { materialID, name: material.name, unitMeasure: material.unit_Measure, prediction: 'Not enough data' };
      }
    }));

    res.json(predictions);
  } catch (error) {
    console.error('Error executing query', error.message);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});



app.get('/compute_sma', async (req, res) => {
  try {
    const days = req.query.days;

    const query = `
      SELECT
        rm.name AS raw_material_name,
        SUM(rmo.no_of_materials) - AVG(rmo.no_of_materials) AS sma,
        um."measure_ID" AS unit
      FROM
        "rawMaterials_Out" AS rmo
      JOIN
        "raw_Materials" AS rm ON rmo."materialID" = rm."materialID"
      JOIN 
        "unit_Measure" AS um ON rm."unit_Measure" = um."measure_ID"
      WHERE
        rmo."date" >= NOW() - INTERVAL '${days} days'
        AND rmo.reason = 'sold' 
      GROUP BY
        rm.name, um."measure_ID";
    `;

    const { rows } = await pool.query(query);

    res.json(rows.map(row => ({
      name: row.raw_material_name,
      prediction: row.sma,
      unitMeasure: row.unit
    })));
  } catch (error) {
    console.error('Error computing SMA:', error.message);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});



app.get('/view_raw_materials', checkAuthenticated, checkRole(['Admin', 'Stock Controller', 'Manufacturer', 'Sales']), async (req, res) => {
  try {
    const { data: rawMatsPurchasing, error } = await supabase
      .from('rawMaterials_purchasing')
      .select('*');

    if (error) {
      console.error('Error fetching raw materials data:', error.message);
      res.status(500).json({ error: 'Internal Server Error' });
      return;
    }

    const { data: rawMaterials, error: materialsError } = await supabase
      .from('raw_Materials')
      .select('*');

    if (materialsError) {
      console.error('Error fetching raw materials data:', materialsError.message);
      res.status(500).json({ error: 'Internal Server Error' });
      return;
    }

    console.log('Raw Materials Purchasing Data:', rawMatsPurchasing);
    console.log('Raw Materials Data:', rawMaterials);

    const materials = rawMaterials.map(material => {
      const purchasingData = rawMatsPurchasing.find(item => item.materialID === material.materialID);
      return {
        ...material,
        purchasingData: purchasingData,
      };
    });

    res.render('view_raw_materials', {
      materials: materials, userRole: req.user.position
    });
  } catch (error) {
    console.error('Error handling /view_raw_materials request:', error.message);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

app.get('/purchase_report', checkAuthenticated, checkRole(['Admin', 'Stock Controller']), async (req, res) => {
  try {
    res.render('purchase_report', { purchases: null, fromDate: null, toDate: null, userRole: req.user.position, showBackButton: false});
  } catch (error) {
    console.error('Error fetching data from database', error.message);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

app.get('/sidebar', checkAuthenticated, (req, res) => {
  res.render('sidebar');
});

app.get('/add_sales_log', checkAuthenticated, (req, res) => {
  res.render('add_sales_log');
});

app.get('/view_usage_report', checkAuthenticated, checkRole(['Admin', 'Stock Controller', 'Manufacturer']), (req, res) => {
  res.render('view_usage_report', { purchases: null, fromDate: null, toDate: null, userRole: req.user.position, showBackButton: false});
});

app.get('/add_chemical', checkAuthenticated, checkRole(['Admin', 'Manufacturer']), async (req, res) => {
  try {
    const unitMeasureList = await getUnitMeasures();
    const materialName = await getRawMaterialName();

    res.render('add_chemical', { units: unitMeasureList, material: materialName, userRole: req.user.position });
  } catch (error) {
    console.error('Error fetching data from database', error.message);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

app.get('/searchByNameRawMaterials', checkAuthenticated, async (req, res) => {
  const data = await searchByNameRawMaterials();
  res.json(data);
});

app.get('/searchByNamePurchaseReport', checkAuthenticated, async (req, res) => {
  try {
    const materialName = req.query.materialName;
    console.log("This is the material name ", materialName);
    const result = await getRawMaterialsPurchasingByID(materialName);
    res.render('purchase_report', { purchases: result, userRole: req.user.position });
  } catch (err) {
    console.error(err);
    res.status(500).send('Internal Server Error');
  }
});

app.get('/detailedReport/:materialName', checkAuthenticated, async (req, res) => {
  const materialName = req.params.materialName;
  const { fromDate, toDate } = req.query;

  const materialIDData = await getIDByName(materialName);
  const materialID = materialIDData[0].materialID;
  const purchaseList = await getRawMaterialsPurchasingByID(materialID);

  res.render('purchase_report', { purchases: purchaseList, fromDate: fromDate || null, toDate: toDate || null, showBackButton: true, userRole: req.user.position });
});

app.get('/usageDetailedReport/:materialName', checkAuthenticated, async (req, res) => {
  const materialName = req.params.materialName;
  const { fromDate, toDate } = req.query;

  const materialIDData = await getIDByName(materialName);
  const materialID = materialIDData[0].materialID;
  const purchaseList = await getRawMaterialsOutByID(materialID);

  console.log("This is the purchase list: ", purchaseList);
  res.render('view_usage_report', { purchases: purchaseList, fromDate: fromDate || null, toDate: toDate || null, showBackButton: true, userRole: req.user.position });
});

app.get('/searchByDate', checkAuthenticated, async (req, res) => {
  const fromDate = req.query.fromDateFilter;
  const toDate = req.query.toDateFilter;

  const response = await searchByDate(fromDate, toDate);
  const purchasesWithData = await Promise.all(
    response.map(async (purchase) => {
      purchase.materialName = await getNameByID(purchase.materialID);
      return purchase;
    }),
  );

  const materialQuantities = calculateTotalQuantities(purchasesWithData);
  const newRecords = createNewRecord(materialQuantities);

  res.render('purchase_report', { purchases: newRecords, fromDate: fromDate, toDate: toDate, userRole: req.user.position, showBackButton: false });
});

app.get('/searchUsageByDate', checkAuthenticated, async (req, res) => {
  const fromDate = req.query.fromDateFilter;
  const toDate = req.query.toDateFilter;

  const response = await searchUsageByDate(fromDate, toDate);
  const purchasesWithData = await Promise.all(
    response.map(async (purchase) => {
      purchase.materialName = await getNameByID(purchase.materialID);
      return purchase;
    }),
  );

  const materialQuantities = calculateTotalQuantities(purchasesWithData);
  console.log(materialQuantities);
  const newRecords = createNewRecord(materialQuantities);
  console.log("New Record: ", newRecords);

  res.render('view_usage_report', { purchases: newRecords, fromDate: fromDate, toDate: toDate, userRole: req.user.position, showBackButton: false });
});

app.get('/add_material_purchase', checkAuthenticated, checkRole(['Admin', 'Stock Controller']), async (req, res) => {
  try {
    const unitMeasureList = await getUnitMeasures();
    const materialName = await getRawMaterialName();
    res.render('add_material_purchase', { units: unitMeasureList, material: materialName, userRole: req.user.position });
  } catch (error) {
    console.error('Error fetching data from database', error.message);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

app.get('/manage_user', checkAuthenticated, checkRole(['Admin']), async (req, res) => {
  try {
    const userList = await getUserlist();
    res.render('manage_user', { users: userList, userRole: req.user.position });
  } catch (error) {
    console.error('Error fetching data from database', error.message);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// ================ POST ROUTES ==================

app.post('/create_order', checkAuthenticated, async (req, res) => {
  const orderRows = JSON.parse(req.body.orderDataJson);
  console.log("Retrieved Data:", JSON.stringify(orderRows, null, 2));

  try {
    for (const orderData of orderRows) {
      const { chemical_Name, quantity, date_Purchased } = orderData;

      const chemicalData = await getChemicalData(chemical_Name);
      if (!chemicalData) {
        throw new Error('Chemical not found: ' + chemical_Name);
      }

      console.log(chemicalData);

      const { productID, unit_Cost } = chemicalData[0];
      const totalCost = unit_Cost * quantity;

      await insertOrder(productID, quantity, totalCost, date_Purchased);

      const recipes = await getRecipeData(productID);
      for (const recipe of recipes) {
        const requiredQuantity = recipe.quantity * quantity;

        const newQuantity = await calculateNewRawMaterialQuantity(recipe.materialID, requiredQuantity);

        await updateRawMaterialQuantity(recipe.materialID, newQuantity);

        await recordRawMaterialOutflow(recipe.materialID, requiredQuantity, recipe.unit_Measure, date_Purchased, 'sold');
      }
    }

    res.status(200).send('Orders added successfully');
  } catch (error) {
    console.error('Error processing orders:', error.message);
    res.status(500).send('Error processing orders: ' + error.message);
  }
});

app.post('/signin', checkNotAuthenticated, passport.authenticate('local', {
  successRedirect: '/', 
  failureRedirect: '/signin?error=auth',
  failureFlash: true
}));

app.post('/add_chemical_recipe', checkAuthenticated, async (req, res) => {
  const { chemical_Name, unit_Measure, unit_cost, unit_Measure_custom, base_quantity } = req.body;
  const recipeData = JSON.parse(req.body.recipeDataJson);
  const active = "TRUE";
  const default_quantity = 0;

  console.log("Received chemical data:", { chemical_Name, unit_Measure, unit_cost, unit_Measure_custom, base_quantity });
  console.log("Received recipe data:", recipeData);

  let check_Measure = unit_Measure === 'other' ? unit_Measure_custom : unit_Measure;
  let productID;

  try {
    let chemicalData;
    const existingChemical = await getChemicalProductID(chemical_Name);
    if (existingChemical) {
      console.log('Chemical already exists:', chemical_Name);
      productID = existingChemical;
    } else {
      chemicalData = await insertNewChemical(chemical_Name, check_Measure, unit_cost, active, base_quantity);
      if (!chemicalData || chemicalData.length === 0) {
        console.error('Failed to insert new chemical or retrieve productID');
        return res.status(500).send('Error adding chemical');
      }
      productID = chemicalData[0].productID;
    }

    const recipeExists = await checkRecipeExists(productID);
    if (recipeExists) {
      console.log('Recipe already exists for productID:', productID);
      return res.redirect('/view_chemical_list');
    }

    for (const item of recipeData) {
      let materialID;
      if (item.rawMaterial === 'other') {
        materialID = await insertNewMaterialAndGetID(item.material_name_custom, default_quantity, item.unitMeasure);
      } else {
        materialID = await getMaterialIDByName(item.rawMaterial);
      }

      if (!materialID) {
        console.error('Failed to find or create materialID for:', item.rawMaterial);
        continue;
      }

      await insertRecipe(productID, {
        materialID: materialID,
        quantity: item.quantity,
        unitMeasure: item.unitMeasure
      });
    }

    res.redirect('/view_chemical_list');
  } catch (error) {
    console.error('Error handling database operation:', error.message);
    res.status(500).send('Internal Server Error');
  }
});

app.get('/input_inventory_count', checkAuthenticated, async (req, res) => {
  try {
    const { data: rawMatsPurchasing, error } = await supabase
      .from('rawMaterials_purchasing')
      .select('*');

    if (error) {
      console.error('Error fetching raw materials data:', error.message);
      res.status(500).json({ error: 'Internal Server Error' });
      return;
    }

    const { data: rawMaterials, error: materialsError } = await supabase
      .from('raw_Materials')
      .select('*');

    if (materialsError) {
      console.error('Error fetching raw materials data:', materialsError.message);
      res.status(500).json({ error: 'Internal Server Error' });
      return;
    }

    console.log('Raw Materials Purchasing Data:', rawMatsPurchasing);
    console.log('Raw Materials Data:', rawMaterials);

    const materials = rawMaterials.map(material => {
      const purchasingData = rawMatsPurchasing.find(item => item.materialID === material.materialID);
      return {
        ...material,
        purchasingData: purchasingData,
      };
    });

    res.render('input_inventory_count', {
      materials: materials, userRole: req.user.position
    });
  } catch (error) {
    console.error('Error handling /input_inventory_count request:', error.message);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

app.post('/input_inventory', checkAdminAuthenticated, async (req, res) => {
  try {
    const submittedMaterials = Object.keys(req.body).reduce((acc, key) => {
      if (key.startsWith("quantity_")) {
        const materialID = key.split("_")[1];
        const expiredKey = `expired_${materialID}`;
        const expiredQuantity = parseFloat(req.body[expiredKey], 10);
        acc.push({ materialID, quantity: parseFloat(req.body[key], 10), expiredQuantity });
      }
      return acc;
    }, []);
    console.log(submittedMaterials);

    const date_Report = req.body.date_Report;

    const dbMaterials = await getRawMaterialsData();
    console.log(dbMaterials);

    let discrepancies = [];
    let expired = [];
    submittedMaterials.forEach(submitted => {
      const dbMaterial = dbMaterials.find(db => db.materialID === submitted.materialID);
      if (!dbMaterial) {
        console.error(`Material with ID ${submitted.materialID} not found in database.`);
        return;
      }
      console.log(submitted.expiredQuantity);
      const quantityDifference = (dbMaterial.quantity - submitted.expiredQuantity) - submitted.quantity;
      if (quantityDifference !== 0) {
        discrepancies.push({
          materialID: submitted.materialID,
          name: dbMaterial.name,
          expectedQuantity: dbMaterial.quantity - submitted.expiredQuantity,
          submittedQuantity: submitted.quantity,
          difference: quantityDifference,
          unit_Measure: dbMaterial.unit_Measure,
          date_Report
        });
      }
      if (submitted.expiredQuantity > 0){
        expired.push({
          materialID: submitted.materialID,
          name: dbMaterial.name,
          systemQuantity : dbMaterial.quantity,
          expired_Quantity : submitted.expiredQuantity,
          unit_Measure: dbMaterial.unit_Measure,
          date_Report
        });
      }
    });
    if (expired.length > 0 || discrepancies.length > 0){
      console.log('Expired items found:', expired);
      insertRawMatOutExpired(expired);
      for (const material of expired){
        const { materialID, systemQuantity, expired_Quantity } = material;
        updateMaterialQuantity(materialID, systemQuantity - expired_Quantity);
      }
      console.log('Discrepancies found:', discrepancies);
      insertDiscrepancyReport(discrepancies);
      insertRawMatOutMissing(discrepancies);
      for (const material of discrepancies){
        const { materialID, submittedQuantity } = material;
        updateMaterialQuantity(materialID, submittedQuantity);
      }
      res.send('<script>alert("Discrepancy/Expired items found. Updating inventory accordingly."); window.location.href="/input_inventory_count";</script>');
    } else {
      res.send('<script>alert("No discrepancy or expired items found."); window.location.href="/input_inventory_count";</script>');
    }
  } catch (error) {
    console.log('Something Wrong', error.message);
  }
});

app.post('/signup', checkAdminAuthenticated, async (req, res) => {
  try {
    const { username, email, first_name, last_name, password, position } = req.body;
    const hashedPassword = await bcrypt.hash(req.body.password, 10);
    const newUserData = {
      username,
      email,
      first_name,
      last_name,  
      password: hashedPassword,
      position
    }
    
    await createUsers(newUserData);
    if (newUserData) {
      res.redirect('/manage_user');
    } else {
      res.status(500).json({ error: 'Error creating user' });
    }
  } catch (error) {
    console.error('Error creating user:', error.message);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

app.post('/add_material', checkAuthenticated, async (req, res) => {
  const materialRows = JSON.parse(req.body.materialDataJson);

  console.log("Received material data:", materialRows);

  for (const materialData of materialRows) {
    try {
      let unit_Measure = materialData.unit_Measure === 'other' ? materialData.unit_Measure_custom : materialData.unit_Measure;
      let material_Name = materialData.name === 'other' ? materialData.material_name_custom : materialData.name;

      let materialID;
      const existingMaterial = await checkMaterialExists(material_Name);

      if (existingMaterial) {
        materialID = existingMaterial.materialID;
        conversionData = parseInt(materialData.no_of_materials);

        if (['ml', 'l', 'tsp', 'Tbs', 'fl-oz', 'cup', 'pnt', 'qt', 'gal'].includes(unit_Measure)) {
          conversionData = convert(conversionData).from(unit_Measure).to('ml');
        } else if (['mcg', 'mg', 'g', 'kg', 'oz', 'lb'].includes(unit_Measure)) {
          conversionData = convert(conversionData).from(unit_Measure).to('g');
        }
        let updatedQuantity = existingMaterial.quantity + conversionData;

        await updateMaterialQuantity(materialID, updatedQuantity);
      } else {
        let no_of_materials = parseInt(materialData.no_of_materials);

        if (['ml', 'l', 'tsp', 'Tbs', 'fl-oz', 'cup', 'pnt', 'qt', 'gal'].includes(unit_Measure)) {
          no_of_materials = convert(no_of_materials).from(unit_Measure).to('ml');
          unit_Measure = 'ml';
          console.log(unit_Measure + " converted to ml");
        } else if (['mcg', 'mg', 'g', 'kg', 'oz', 'lb'].includes(unit_Measure)) {
          no_of_materials = convert(no_of_materials).from(unit_Measure).to('g');
          unit_Measure = 'g';
          console.log(unit_Measure + " converted to g");
        }

        await insertNewMaterial({ 
          name: material_Name, 
          unit_Measure: unit_Measure, 
          no_of_materials: no_of_materials
        });

        const newlyInsertedMaterial = await checkMaterialExists(material_Name);
        if (newlyInsertedMaterial) {
          materialID = newlyInsertedMaterial.materialID;
        } else {
          console.error('Failed to insert and retrieve new material:', material_Name);
          continue;
        }
      }

      if (materialID) {
        await insertMaterialPurchasing(materialID, {
          no_of_materials: parseInt(materialData.no_of_materials),
          unit_Measure: materialData.unit_Measure,
          unit_Price: parseFloat(materialData.unit_Price),
          date_Purchased: materialData.date_Purchased
        });
      }
    } catch (error) {
      console.error('Error processing material row:', materialData.name, error.message);
    }
  }

  res.redirect('/purchase_report');
});

app.post('/reset_password', checkAuthenticated, async (req, res) => {
  const { accountID, currentPassword, newPassword } = req.body;

  if (!newPassword || newPassword.trim() === '') {
    return res.status(400).json({ message: 'New password is required.' });
  }

  try {
    const { data: user, error: userFetchError } = await supabase
      .from('accounts') 
      .select('password')
      .eq('accountID', accountID)
      .single();

    if (userFetchError || !user) {
      throw new Error('User not found.');
    }

    const match = await bcrypt.compare(currentPassword, user.password);
    if (!match) {
      return res.status(403).json({ message: 'Incorrect current password.' });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);

    const { error } = await supabase
      .from('accounts') 
      .update({ password: hashedPassword })
      .eq('accountID', accountID);

    if (error) {
      throw error;
    }

    res.json({ message: 'Password successfully reset!' });
  } catch (error) {
    console.error('Error resetting password:', error.message);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

app.put('/toggleUserActivation/:accountID', checkAuthenticated, async (req, res) => {
  try {
    const { accountID } = req.params;
    const { is_Active } = req.body;

    await toggleUserActivation(accountID, is_Active);
    res.sendStatus(200);
  } catch (error) {
    console.error('Error toggling user activation:', error.message);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

app.put('/users/:accountId', async (req, res) => {
  const accountId = req.params.accountId;
  const { is_Active } = req.body;

  try {
    const { data, error } = await supabase
      .from('accounts')
      .update({ is_Active: is_Active })
      .eq('accountID', accountId);

    if (error) throw error;

    if (data && data.length === 1) {
      const updatedUser = data[0];
      res.json({
        message: `User ${is_Active ? 'activated' : 'deactivated'} successfully`,
        is_Active: updatedUser.is_Active
      });
    } else {
      res.status(404).json({ message: 'User not found' });
    }
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

app.post('/logout', checkAuthenticated, function(req, res, next) {
  req.logout(function(err) {
    if (err) { return next(err); }
    res.redirect('/');
  });
});
