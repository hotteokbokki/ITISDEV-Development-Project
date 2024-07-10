// `allMeasures` includes all the measures packaged with this library
const convert = require('convert-units');


// USE THIS FORMAT CONVERSION
// console.log(convert(2).from('l').to('ml'));


const express = require('express');
const flash = require('express-flash')
const session = require('express-session');
const app = express();
const dotenv = require('dotenv');
const bcrypt = require('bcrypt');
const passport = require('passport');
const cookieParser = require('cookie-parser');
const methodOverride = require('method-override');
// `allMeasures` includes all the measures packaged with this library



dotenv.config();

const path = require('path');

const authRoutes = require('./routes/authRoutes');
const userRoutes = require('./routes/userRoutes');


app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(cookieParser());
app.use(flash());

// Configure session middleware
app.use(session({
  secret: process.env.SESSION_SECRET, 
  resave: false,
  saveUninitialized: true,
  // cookie: { secure: false }
}));
app.use(passport.initialize());
app.use(passport.session()) ;
app.use(methodOverride('_method'));
require('./passport-config');

// Set up your Supabase connection
const { createClient } = require('@supabase/supabase-js');

//Controller imports
const { getUserlist, createUsers, toggleUserActivation } = require('./controllers/userController');
const {insertRawMatOut, getRawMatsOut_Reason, getRawMaterialsOutByID, insertRawMatOutMissing, insertRawMatOutExpired} = require ('./controllers/rawMaterialsOut.js');
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

  // Convert to 'l' if unit_Measure is volume unit, 'g' if it's mass unit
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
      // Convert to 'l' if unit_Measure is volume unit, 'g' if it's mass unit
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
    // Fetch data from the 'orders' table
    const { data: orders, error } = await supabase
      .from('orders')
      .select('productID, order_quantity')
      .order('productID');

    // Fetch data from the 'raw_Materials' table
    const { data: rawMaterials, rawMaterialsError } = await supabase
      .from('raw_Materials')
      .select('name, quantity, unit_Measure');

    // Check for errors
    if (error || rawMaterialsError) {
      console.error('Error fetching data:', error || rawMaterialsError);
      res.status(500).json({ error: 'Internal Server Error' });
      return;
    }

    // Aggregate order quantities by productID
    const aggregatedOrders = orders.reduce((acc, order) => {
      if (!acc[order.productID]) {
        acc[order.productID] = 0;
      }
      acc[order.productID] += order.order_quantity;
      return acc;
    }, {});

    // Fetch chemical names from the 'chemicals' table based on productIDs
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

    // Fetch low-stock chemicals from rawMaterials and sort them by quantity in descending order
    const lowStockChemicals = rawMaterials
      .filter(material => {
        // Check if unit measure is kg or L and quantity is below 10kg or 5L
        return (
          (material.unit_Measure === 'g' && material.quantity < 10000) ||
          (material.unit_Measure === 'ml' && material.quantity < 5000)
        );
      })
      .sort((a, b) => a.quantity - b.quantity);

    // Resolve all promises
    const chemicalNamesWithOrders = await Promise.all(chemicalNamesPromises);

    // Filter out null values and sort by totalOrders
    const filteredChemicalNames = chemicalNamesWithOrders.filter(item => item !== null);
    const sortedChemicalNames = filteredChemicalNames.sort((a, b) => b.totalOrders - a.totalOrders);

    // Render the view with the aggregated data and low-stock chemicals
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

// Add Roles for this
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

      // Fetch the productID for the given chemical name
      const chemicalData = await getChemicalData(chemical_Name);
      if (!chemicalData || chemicalData.length === 0) {
          return res.status(404).json({ message: 'Chemical not found' });
      }
      const productID = chemicalData[0].productID;

      // Fetch the recipe data for the productID
      const recipes = await getRecipeData(productID);
      if (!recipes) {
          return res.status(404).json({ message: 'Recipe not found for the chemical' });
      }

      // Fetch material names and calculate required quantities
      const materials = await Promise.all(recipes.map(async (recipe) => {
          const materialData = await getMaterialData(recipe.materialID); // Implement this function
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


app.get('/signin',checkNotAuthenticated, (req, res) => {
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
    // Fetch data from the 'orders' table
    const { data: orders, error } = await supabase
      .from('orders')
      .select('productID, order_quantity')
      .order('productID');

    // Fetch data from the 'raw_Materials' table
    const { data: rawMaterials, rawMaterialsError } = await supabase
      .from('raw_Materials')
      .select('name, quantity, unit_Measure');

    // Check for errors
    if (error || rawMaterialsError) {
      console.error('Error fetching data:', error || rawMaterialsError);
      res.status(500).json({ error: 'Internal Server Error' });
      return;
    }

    // Aggregate order quantities by productID
    const aggregatedOrders = orders.reduce((acc, order) => {
      if (!acc[order.productID]) {
        acc[order.productID] = 0;
      }
      acc[order.productID] += order.order_quantity;
      return acc;
    }, {});

    // Fetch chemical names from the 'chemicals' table based on productIDs
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

   // Fetch low-stock chemicals from rawMaterials and sort them by quantity in descending order
const lowStockChemicals = rawMaterials
.filter(material => {
  // Check if unit measure is kg or L and quantity is below 10kg or 5L
  return (
    (material.unit_Measure === 'g' && material.quantity < 10000) ||
    (material.unit_Measure === 'ml' && material.quantity < 5000)
  );
})
.sort((a, b) => a.quantity - b.quantity);


    // Resolve all promises
    const chemicalNamesWithOrders = await Promise.all(chemicalNamesPromises);

    // Filter out null values and sort by totalOrders
    const filteredChemicalNames = chemicalNamesWithOrders.filter(item => item !== null);
    const sortedChemicalNames = filteredChemicalNames.sort((a, b) => b.totalOrders - a.totalOrders);

    // Render the view with the aggregated data and low-stock chemicals
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
  res.render('inventory', {userRole: req.user.position});
});


// Route to compute SMA
app.get('/compute_sma', async (req, res) => {
  try {
      const days = req.query.days; // Number of days from the query parameter

      // SQL query to compute SMA
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

      // Execute the query
      const { rows } = await pool.query(query);

      // Send the computed data as JSON response
      res.json(rows);
  } catch (error) {
      console.error('Error computing SMA:', error.message);
      res.status(500).json({ error: 'Internal Server Error' });
  }
});


// Route to compute WMA
app.get('/compute_wma', async (req, res) => {
  try {
    const days = req.query.days; // Number of days from the query parameter

    // SQL query to compute WMA
    const query = `
    SELECT
    rm.name AS raw_material_name,
    SUM(rmo.no_of_materials * 1) / 1 AS wma,
    um."measure_ID" AS unit
FROM
    "rawMaterials_Out" AS rmo
JOIN
    "raw_Materials" AS rm ON rmo."materialID" = rm."materialID"
JOIN 
    "unit_Measure" AS um ON rm."unit_Measure" = um."measure_ID"
JOIN
    (SELECT 
        rmo."materialID",
        rmo.no_of_materials,
        generate_series(1, ${days}, 1) AS weight
    FROM
        "rawMaterials_Out" AS rmo
    WHERE
        rmo."date" >= NOW() - INTERVAL '${days} days'
        AND rmo.reason = 'sold'
    ORDER BY
        rmo."date" DESC
    LIMIT ${days}) AS weights ON rmo."materialID" = weights."materialID"
GROUP BY
    rm.name, um."measure_ID";
    `;

    // Execute the query
    const { rows } = await pool.query(query);

    // Send the computed data as JSON response
    res.json(rows);
  } catch (error) {
    console.error('Error computing WMA:', error.message);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});



app.get('/view_raw_materials', checkAuthenticated, checkRole(['Admin', 'Stock Controller', 'Manufacturer', 'Sales']), async (req, res) => {
   try {
    //await getTotalQuantityAndUpdateMaterials();
    // Fetch raw materials data from Supabase
    const { data: rawMatsPurchasing, error } = await supabase
      .from('rawMaterials_purchasing')
      .select('*');

    // Check for errors
    if (error) {
      console.error('Error fetching raw materials data:', error.message);
      res.status(500).json({ error: 'Internal Server Error' });
      return;
    }

    // Fetch raw materials data from Supabase
    const { data: rawMaterials, error: materialsError } = await supabase
      .from('raw_Materials')
      .select('*');

    // Check for errors in fetching raw materials data
    if (materialsError) {
      console.error('Error fetching raw materials data:', materialsError.message);
      res.status(500).json({ error: 'Internal Server Error' });
      return;
    }

    // Log the raw materials data in the terminal
    console.log('Raw Materials Purchasing Data:', rawMatsPurchasing);
    console.log('Raw Materials Data:', rawMaterials);

    // Combine the data based on materialID
    const materials = rawMaterials.map(material => {
      const purchasingData = rawMatsPurchasing.find(item => item.materialID === material.materialID);
      return {
        ...material,
        // Add other properties from rawMatsPurchasing if needed
        purchasingData: purchasingData,
      };
    });

        // Send the response with the combined data
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
    console.error('Error fetching data from database', error.message)
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

app.get('/sidebar', checkAuthenticated, (req, res) => {
  res.render('sidebar');
});

//TO REMOVE??
app.get('/add_sales_log', checkAuthenticated, (req, res) => {
  res.render('add_sales_log');
});

app.get('/view_usage_report', checkAuthenticated, checkRole(['Admin', 'Stock Controller', 'Manufacturer']), (req, res) => {
  res.render('view_usage_report', { purchases: null, fromDate: null, toDate: null, userRole: req.user.position, showBackButton: false});
});

app.get('/add_chemical', checkAuthenticated, checkRole(['Admin', 'Manufacturer']), async (req, res) => {
  // Gets existing user list from the database
  try {
    const unitMeasureList = await getUnitMeasures();
    const materialName = await getRawMaterialName();

    res.render('add_chemical', { units: unitMeasureList, material: materialName, userRole: req.user.position }); // Passing chemicalName to the view
  } catch (error) {
    console.error('Error fetching data from database', error.message)
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

app.get('/searchByNameRawMaterials', checkAuthenticated, async (req, res) => {
  const data = await searchByNameRawMaterials();

  res.json(data);
});

app.get('/searchByNamePurchaseReport', checkAuthenticated, async (req, res) => {
  // Gets the name from the database
  try {
    const materialName = req.query.materialName;

    console.log("This is the material name ", materialName)

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
  const materialID = materialIDData[0].materialID; // Extracting materialID from the object
  const purchaseList = await getRawMaterialsPurchasingByID(materialID); // Pass materialID directly

  res.render('purchase_report', { purchases: purchaseList, fromDate: fromDate || null, toDate: toDate || null, showBackButton: true, userRole: req.user.position });
});

app.get('/usageDetailedReport/:materialName', checkAuthenticated, async (req, res) => {
  const materialName = req.params.materialName;
  const { fromDate, toDate } = req.query;

  const materialIDData = await getIDByName(materialName);
  const materialID = materialIDData[0].materialID; // Extracting materialID from the object
  const purchaseList = await getRawMaterialsOutByID(materialID); // Pass materialID directly

  console.log("This is the purchase list: ", purchaseList);
  res.render('view_usage_report', { purchases: purchaseList, fromDate: fromDate || null, toDate: toDate || null, showBackButton: true, userRole: req.user.position });
});

// Inside your route handler
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
  // Calculate total quantities for each material name
  const materialQuantities = calculateTotalQuantities(purchasesWithData);

  // Create a new record for each unique material name with accumulated total no_of_materials
  const newRecords = createNewRecord(materialQuantities);

  // Render the modified data
  res.render('purchase_report', {purchases: newRecords, fromDate: fromDate, toDate: toDate, userRole: req.user.position, showBackButton: false});
});

// Inside your route handler
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
  // Calculate total quantities for each material name
  const materialQuantities = calculateTotalQuantities(purchasesWithData);

  console.log(materialQuantities);

  // Create a new record for each unique material name with accumulated total no_of_materials
  const newRecords = createNewRecord(materialQuantities);

  console.log("New Record: ", newRecords);

  // Render the modified data
  res.render('view_usage_report', {purchases: newRecords, fromDate: fromDate, toDate: toDate, userRole: req.user.position, showBackButton: false});
});

app.get('/add_material_purchase', checkAuthenticated, checkRole(['Admin', 'Stock Controller']), async (req, res) => {
  // Gets existing user list from the database
  try {
    const unitMeasureList = await getUnitMeasures();
    const materialName = await getRawMaterialName(); // Fetch materials using the controller function
    res.render('add_material_purchase', { units: unitMeasureList, material: materialName, userRole: req.user.position }); // Passing unitMeasureList to the view
  } catch (error) {
    console.error('Error fetching data from database', error.message)
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

app.get('/manage_user', checkAuthenticated, checkRole(['Admin']), async (req, res) => {
  // Gets existing user list from the database
  try {
    const userList = await getUserlist();
    res.render('manage_user', { users: userList, userRole: req.user.position }); // Passing userList to the view
  
  } catch (error) {
    console.error('Error fetching data from database', error.message)
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

      // Fetch chemical data
      const chemicalData = await getChemicalData(chemical_Name);
      if (!chemicalData) {
        throw new Error('Chemical not found: ' + chemical_Name);
      }

      console.log(chemicalData);

      const { productID, unit_Cost } = chemicalData[0];
      const totalCost = unit_Cost * quantity;

      // Insert order
      await insertOrder(productID, quantity, totalCost, date_Purchased);

      // Fetch recipe data
      const recipes = await getRecipeData(productID);
      for (const recipe of recipes) {
        const requiredQuantity = recipe.quantity * quantity;

        // Calculate new raw material quantity
        const newQuantity = await calculateNewRawMaterialQuantity(recipe.materialID, requiredQuantity);

        // Update raw material quantity
        await updateRawMaterialQuantity(recipe.materialID, newQuantity);

        // Record raw material outflow
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
  failureFlash: true // Enable flash messages for failed authentication
}));

app.post('/add_chemical_recipe', checkAuthenticated, async (req, res) => {
  const { chemical_Name, unit_Measure, unit_cost, unit_Measure_custom, base_quantity } = req.body;
  const recipeData = JSON.parse(req.body.recipeDataJson); // Parse recipe data from the form
  const active = "TRUE";
  const default_quantity = 0;

  console.log("Received chemical data:", { chemical_Name, unit_Measure, unit_cost, unit_Measure_custom, base_quantity });
  console.log("Received recipe data:", recipeData);

  let check_Measure = unit_Measure === 'other' ? unit_Measure_custom : unit_Measure;
  let productID;

  try {
      let chemicalData;
      // Check if the chemical already exists
      const existingChemical = await getChemicalProductID(chemical_Name);
      if (existingChemical) {
        console.log('Chemical already exists:', chemical_Name);
        productID = existingChemical;
      } else {
        // Insert new chemical
        chemicalData = await insertNewChemical(chemical_Name, check_Measure, unit_cost, active, base_quantity);
        if (!chemicalData || chemicalData.length === 0) {
          console.error('Failed to insert new chemical or retrieve productID');
          return res.status(500).send('Error adding chemical');
        }
        productID = chemicalData[0].productID;
      }
    // Check if a recipe already exists for this chemical
    const recipeExists = await checkRecipeExists(productID);
    if (recipeExists) {
      console.log('Recipe already exists for productID:', productID);
      return res.redirect('/view_chemical_list');
    }

    // Insert recipe data (optimized version may batch insertions)
    for (const item of recipeData) {
      let materialID;
      if (item.rawMaterial === 'other') {
        materialID = await insertNewMaterialAndGetID(item.material_name_custom, default_quantity, item.unitMeasure);
      } else {
        materialID = await getMaterialIDByName(item.rawMaterial);
      }

      if (!materialID) {
        console.error('Failed to find or create materialID for:', item.rawMaterial);
        continue; // Skip this item
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
  // Gets existing user list from the database
  try {
    //await getTotalQuantityAndUpdateMaterials();
    // Fetch raw materials data from Supabase
    const { data: rawMatsPurchasing, error } = await supabase
      .from('rawMaterials_purchasing')
      .select('*');

    // Check for errors
    if (error) {
      console.error('Error fetching raw materials data:', error.message);
      res.status(500).json({ error: 'Internal Server Error' });
      return;
    }

    // Fetch raw materials data from Supabase
    const { data: rawMaterials, error: materialsError } = await supabase
      .from('raw_Materials')
      .select('*');

    // Check for errors in fetching raw materials data
    if (materialsError) {
      console.error('Error fetching raw materials data:', materialsError.message);
      res.status(500).json({ error: 'Internal Server Error' });
      return;
    }

    // Log the raw materials data in the terminal
    console.log('Raw Materials Purchasing Data:', rawMatsPurchasing);
    console.log('Raw Materials Data:', rawMaterials);

    // Combine the data based on materialID
    const materials = rawMaterials.map(material => {
      const purchasingData = rawMatsPurchasing.find(item => item.materialID === material.materialID);
      return {
        ...material,
        // Add other properties from rawMatsPurchasing if needed
        purchasingData: purchasingData,
      };
    });

    // [UNNECESSARY] Log the combined data
    console.log('Combined Materials Data:', materials);

    // Send the response with the combined data
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
    // Step 1: Extract the submitted form data
    const submittedMaterials = Object.keys(req.body).reduce((acc, key) => {
      if (key.startsWith("quantity_")) {
        const materialID = key.split("_")[1];
        const expiredKey = `expired_${materialID}`; // Generate key for expired input
        const expiredQuantity = parseFloat(req.body[expiredKey], 10);
        acc.push({ materialID, quantity: parseFloat(req.body[key], 10), expiredQuantity });
      }
      return acc;
    }, []);
    console.log(submittedMaterials);

    const date_Report = req.body.date_Report;

    dbMaterials = await getRawMaterialsData();
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
      const quantityDifference = (dbMaterial.quantity-submitted.expiredQuantity) - submitted.quantity;
      if (quantityDifference !== 0) {
        discrepancies.push({
          materialID: submitted.materialID,
          name: dbMaterial.name,
          expectedQuantity: dbMaterial.quantity-submitted.expiredQuantity,
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
        const {materialID, systemQuantity, expired_Quantity} = material;
        updateMaterialQuantity(materialID, systemQuantity-expired_Quantity);
      }
      console.log('Discrepancies found:', discrepancies);
      insertDiscrepancyReport(discrepancies);
      insertRawMatOutMissing(discrepancies);
      for (const material of discrepancies){
        const { materialID, submittedQuantity} = material;
        updateMaterialQuantity(materialID, submittedQuantity);
      }
      res.send('<script>alert("Discrepancy/Expired items found. Updating inventory accordingly."); window.location.href="/input_inventory_count";</script>');
    } else {
      // If no discrepancies, notify the user and redirect or render a success message/page
      res.send('<script>alert("No discrepancy or expired items found."); window.location.href="/input_inventory_count";</script>'); // Adjust as needed
    }
}
catch (error) {
  console.log('Something Wrong', error.message);
}
});

app.get('/manage_user', checkAuthenticated, async (req, res) => {
  // Gets existing user list from the database
  try {
    const userList = await getUserlist();
    res.render('manage_user', { users: userList }); // Passing userList to the view
  
  } catch (error) {
    console.error('Error fetching data from database', error.message)
    res.status(500).json({ error: 'Internal Server Error' });
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
    // Check if newUser exists before logging
    if (newUserData) {
      // Redirect with a query parameter to indicate successful account creation
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

        // Convert to 'l' if unit_Measure is volume unit, 'g' if it's mass unit
        if (['ml', 'l', 'tsp', 'Tbs', 'fl-oz', 'cup', 'pnt', 'qt', 'gal'].includes(unit_Measure)) {
          conversionData = convert(conversionData).from(unit_Measure).to('ml');
        } else if (['mcg', 'mg', 'g', 'kg', 'oz', 'lb'].includes(unit_Measure)) {
          conversionData = convert(conversionData).from(unit_Measure).to('g');
        }
        let updatedQuantity = existingMaterial.quantity + conversionData;

        await updateMaterialQuantity(materialID, updatedQuantity);
      } else {
        let no_of_materials = parseInt(materialData.no_of_materials);

        // Convert to 'l' if unit_Measure is volume unit, 'g' if it's mass unit
        if (['ml', 'l', 'tsp', 'Tbs', 'fl-oz', 'cup', 'pnt', 'qt', 'gal'].includes(unit_Measure)) {
          no_of_materials = convert(no_of_materials).from(unit_Measure).to('ml');
          unit_Measure = 'ml'
          console.log(unit_Measure + "converted to l");
        } else if (['mcg', 'mg', 'g', 'kg', 'oz', 'lb'].includes(unit_Measure)) {
          no_of_materials = convert(no_of_materials).from(unit_Measure).to('g');
          unit_Measure = 'g'
          console.log(unit_Measure + "converted to g");
        }

        await insertNewMaterial({ 
          name: material_Name, 
          unit_Measure: unit_Measure, 
          no_of_materials: no_of_materials
        });

        // Fetch the newly inserted material's ID
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
      // Fetch the current user's hashed password from the database
      const { data: user, error: userFetchError } = await supabase
          .from('accounts') 
          .select('password')
          .eq('accountID', accountID)
          .single();

      if (userFetchError || !user) {
          throw new Error('User not found.');
      }

      // Compare currentPassword with the hashed password
      const match = await bcrypt.compare(currentPassword, user.password);
      if (!match) {
          return res.status(403).json({ message: 'Incorrect current password.' });
      }

      // Hash the new password
      const hashedPassword = await bcrypt.hash(newPassword, 10);

      // Update the password in the database
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

//TO EDIT
// Toggle user activation route
app.put('/toggleUserActivation/:accountID', checkAuthenticated, async (req, res) => {
  try {
    const { accountID } = req.params;
    const { is_Active } = req.body;

    await toggleUserActivation(accountID, is_Active);
    res.sendStatus(200); // Send success status
  } catch (error) {
    console.error('Error toggling user activation:', error.message);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

app.put('/users/:accountId', async (req, res) => {
  const accountId = req.params.accountId;
  const { is_Active } = req.body;

  try {
      // Update user status in Supabase
      const { data, error } = await supabase
          .from('accounts')
          .update({ is_Active: is_Active })
          .eq('accountID', accountId);

      // Handle update errors
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
