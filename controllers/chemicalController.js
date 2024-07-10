const supabase = require('../supabase.js');

exports.getChemicals = async () => {
  // Fetch chemical names from Supabase
  const { data } = await supabase.from('chemicals').select('chemical_Name');

  // Get unique names using a Set
  const uniqueNames = new Set(data.map(row => row.chemical_Name));

  // Convert the Set back to an array
  return Array.from(uniqueNames);
  };

exports.getAllChemicals = async () => {
  // Fetch all chemical data from Supabase
  const { data: chemicalList } = await supabase.from('chemicals').select('chemical_Name, unit_Measure, unit_Cost, is_Active, base_Quantity');

  return chemicalList;
};

exports.insertNewChemical = async (name, unitMeasure, cost, isActive, baseQuantity) => {
  // Insert new chemical into the 'chemicals' table
  const { data, error } = await supabase
    .from('chemicals')
    .insert([
      { chemical_Name: name, unit_Measure: unitMeasure, unit_Cost: cost, is_Active: isActive, base_Quantity: baseQuantity }
    ])
    .select('productID'); // Make sure to select 'productID'

  if (error) {
    console.error('Error inserting new chemical:', error.message);
    return null;
  }

  console.log('Inserted chemical data:', data);
  return data;
};

exports.getChemicalProductID = async (chemicalName) => {
  // Fetch productID for a given chemical name from Supabase
  const { data, error } = await supabase
    .from('chemicals')
    .select('productID')
    .eq('chemical_Name', chemicalName)
    //.single();

  if (error) {
    console.error('Error fetching chemical productID:', error.message);
    throw error;
  }

  return data.length > 0 ? data[0].productID : null;
};

exports.checkRecipeExists = async (productID) => {
  // Check if a recipe exists for a given productID in the 'recipe' table
  const { data, error } = await supabase
    .from('recipe')
    .select('*')
    .eq('productID', productID);

  if (error) {
    console.error('Error checking recipe existence:', error.message);
    throw error;
  }

  return data.length > 0 ? data : null;
};

exports.insertRecipe = async (productID, recipeItem) => {
  // Insert a new recipe item into the 'recipe' table
  const { materialID, quantity, unitMeasure } = recipeItem;
  const { error } = await supabase
    .from('recipe')
    .insert([
      { productID, materialID, quantity, unit_Measure: unitMeasure }
    ]);

  if (error) {
    console.error('Error inserting recipe item:', error.message);
    throw error;
  }
};

exports.getMaterialIDByName = async (materialName) => {
  // Fetch materialID for a given material name from Supabase
  const { data, error } = await supabase
    .from('raw_Materials')
    .select('materialID')
    .eq('name', materialName)
    .single();

  if (error) {
    console.error('Error fetching materialID:', error.message);
    throw error;
  }

  return data ? data.materialID : null;
};

exports.insertNewMaterialAndGetID = async(materialName, default_quantity, unitMeasure) => {
  // Insert a new material into the 'raw_Materials' table and get its ID
  const { data, error } = await supabase
    .from('raw_Materials')
    .insert([{ name: materialName, quantity: default_quantity, unit_Measure: unitMeasure }])
    .select('materialID');

  if (error) {
    console.error('Error inserting new material:', error.message);
    throw error;
  }

  return data.length > 0 ? data[0].materialID : null;
};

