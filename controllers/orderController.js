const supabase = require('../supabase.js');

exports.insertOrder = async (productID, quantity, totalCost, datePurchased) => {
  // Insert a new order into the 'orders' table
  const { data, error } = await supabase
    .from('orders')
    .insert([{ productID, order_quantity: quantity, total_cost: totalCost, date_Ordered: datePurchased }]);

  if (error) {
    throw new Error('Error inserting order: ' + error.message);
  }
  return data;
};

exports.getChemicalData = async (chemicalName) => {
  // Get the productID, unit_Cost, and base_Quantity for a given chemicalName from the 'chemicals' table
  const { data, error } = await supabase
    .from('chemicals')
    .select('productID, unit_Cost, base_Quantity')
    .eq('chemical_Name', chemicalName)
    //.single();

    console.log('Chemical Data:', data);

  if (error) {
    throw new Error('Error fetching chemical data: ' + error.message);
  }
  return data;
};

exports.getRecipeData = async (productID) => {
  // Get the recipe data for a given productID from the 'recipe' table
  const { data, error } = await supabase
    .from('recipe')
    .select('*')
    .eq('productID', productID);

  if (error) {
    throw new Error('Error fetching recipe data: ' + error.message);
  }
  return data;
};

exports.updateRawMaterialQuantity = async (materialID, newQuantity) => {
  // Update the quantity of a raw material in the 'raw_Materials' table
  const { error } = await supabase
    .from('raw_Materials')
    .update({ quantity: newQuantity })
    .eq('materialID', materialID);

  if (error) {
    throw new Error('Error updating raw material quantity: ' + error.message);
  }
};

exports.recordRawMaterialOutflow = async (materialID, quantityUsed, unitMeasure, date, reason) => {
  // Record an outflow of raw material in the 'rawMaterials_Out' table
  const { error } = await supabase
    .from('rawMaterials_Out')
    .insert([{ materialID, no_of_materials: quantityUsed, unit_Measure: unitMeasure, date, reason }]);

  if (error) {
    throw new Error('Error recording raw materials outflow: ' + error.message);
  }
};

exports.calculateNewRawMaterialQuantity = async (materialID, quantityUsed) => {
  // Calculate the new quantity of a raw material after an outflow
  const { data, error } = await supabase
    .from('raw_Materials')
    .select('quantity')
    .eq('materialID', materialID)
    .single();

  if (error) {
    throw new Error('Error fetching raw material quantity: ' + error.message);
  }

  return data.quantity - quantityUsed;
};

exports.getMaterialData = async (materialID) => {
  const { data, error } = await supabase
    .from('raw_Materials')
    .select('name')
    .eq('materialID', materialID)
    .single();

  if (error) {
    throw new Error('Error fetching material data: ' + error.message);
  }
  return data;
};

