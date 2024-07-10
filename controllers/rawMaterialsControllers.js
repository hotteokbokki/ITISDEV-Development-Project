const supabase = require('../supabase.js');

exports.getRawMaterialsData = async () => {
  // Fetch raw materials data
  const { data: rawMaterials, error: materialsError } = await supabase
    .from('raw_Materials')
    .select('*');

  if (materialsError) {
    throw new Error('Error fetching raw materials data');
  }
  return rawMaterials;
};

exports.getRawMaterialsPurchasingByID = async (materialID) => {
  // Fetch raw materials purchasing data by ID
  const { data } = await supabase
    .from('rawMaterials_purchasing')
    .select('*')
    .eq('materialID', materialID);

  return data;
};

exports.getNameByID = async (materialID) => {
  // Fetch name by material ID
  const { data } = await supabase
    .from('raw_Materials')
    .select('name')
    .eq('materialID', materialID);

  // Return the name if data is not empty
  return data.length > 0 ? data[0].name : null;
};

exports.getAllMaterials = async () => {
  // Fetch all material names
  const { data } = await supabase.from('raw_Materials').select('name');

  // Get unique names using a Set
  const uniqueNames = new Set(data.map(row => row.name));

  // Convert the Set back to an array
  return Array.from(uniqueNames);
};

exports.getRawMaterialName = async () => {
  // Fetch raw material names
  const { data } = await supabase.from('raw_Materials').select('name');

  return data;
};

exports.searchByName = async () => {
  // Fetch data by name from orders
  const { data } = await supabase.from('orders').select('*');
};

exports.searchByNameRawMaterials = async () => {
  // Search for raw materials by name
  const { data, error } = await supabase
    .from('raw_Materials')
    .select('quantity, unit_Measure')
    .eq('name', name);

  if (error) {
    console.error('Error searching for material:', error.message);
    return null;
  }

  return data;
};

exports.searchByNamePurchaseReport = async (name) => {
  // Search for materials in purchasing report by name
  const { data, error } = await supabase
    .from('rawMaterials_purchasing')
    .select('no_of_materials, unit_Measure')
    .eq('name', name);

  if (error) {
    console.error('Error searching for material:', error.message);
    return null;
  }

  return data;
};

exports.searchByDate = async (fromDate, toDate) => {
  // Search for data by date range in raw materials purchasing
  const { data, error } = await supabase
    .from('rawMaterials_purchasing')
    .select('materialID, no_of_materials, unit_Measure, total_Price, unit_Price, date_Purchased')
    .gte('date_Purchased', fromDate)
    .lte('date_Purchased', toDate);

  if (error) {
    throw new Error(error.message);
  }

  return data;
};

exports.searchUsageByDate = async (fromDate, toDate) => {
  // Search for usage data by date range in raw materials
  const { data, error } = await supabase
    .from('rawMaterials_Out')
    .select('materialID, no_of_materials, unit_Measure, date')
    .gte('date', fromDate)
    .lte('date', toDate);

  if (error) {
    throw new Error(error.message);
  }

  return data;
};

exports.checkMaterialExists = async (name) => {
  // Check if material exists by name
  const { data, error } = await supabase
    .from('raw_Materials')
    .select('*')
    .eq('name', name)
    .single();

  return error ? null : data;
};

exports.updateMaterialQuantity = async (materialID, quantity) => {
  // Update material quantity by ID
  const { error } = await supabase
    .from('raw_Materials')
    .update({ quantity })
    .eq('materialID', materialID);

  if (error) throw new Error(error.message);
};

exports.insertNewMaterial = async (materialData) => {
  // Insert new material data
  const { name, unit_Measure, no_of_materials } = materialData;

  const { data, error } = await supabase
    .from('raw_Materials')
    .insert([{ name, quantity: no_of_materials, unit_Measure }]);

  if (error) {
    console.error('Error inserting new material:', error.message);
    return null;
  }

  return data;
};

exports.insertMaterialPurchasing = async (materialID, materialData) => {
  // Insert material purchasing data
  const { no_of_materials, unit_Measure, unit_Price, date_Purchased } = materialData;
  const total_Price = unit_Price * no_of_materials;

  console.log('date_Purchased:', date_Purchased); // Debugging

  const { error } = await  supabase 
    .from('rawMaterials_purchasing')
    .insert([{ 
      materialID, 
      no_of_materials, 
      unit_Measure, 
      total_Price, 
      unit_Price, 
      date_Purchased 
    }]);

  if (error) {
    console.error('Error inserting into rawMaterials_purchasing:', error.message);
    throw new Error(error.message);
  }
};

exports.getIDByName = async (name) => {
  // Get ID by name
  const { data } = await supabase
    .from('raw_Materials')
    .select('materialID')
    .eq('name', name);

  return data;
};

exports.insertOrder = async (orderData) => {
  // Insert new order data
  const { productID, order_quantity, total_cost, date_Ordered } = orderData;

  const { data, error } = await supabase
    .from('orders')
    .insert([{ productID, order_quantity, total_cost, date_Ordered }]);

  if (error) {
    console.error('Error inserting new order:', error.message);
    throw new Error(error.message);
  }

  return data;
};