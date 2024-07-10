const supabase = require('../supabase.js');

exports.getUnitMeasures = async () => {
    // Fetch unit measures from the 'unit_Measure' table
    const { data } = await supabase.from('unit_Measure').select('measure_ID');
  
    return data;
};


exports.addUnitMeasure = async (unit) => {
    const { measure_ID } = unit; 

    // Check if the unit already exists
    const existingUnit = await supabase.from('unit_Measure').select().eq('measure_ID', measure_ID);

    if (existingUnit.data.length === 0) {
        // If the unit does not exist, insert it into the database
        const { data } = await supabase.from('unit_Measure').insert([{ measure_ID }]);
        return data;
    } else {
        // If the unit already exists, return the existing unit
        console.log(`Unit with measure_ID ${measure_ID} already exists.`);
        return existingUnit.data[0];
    }
};
