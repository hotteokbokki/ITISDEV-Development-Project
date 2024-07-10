const supabase = require('../supabase.js');

exports.insertRawMatOut = async (materialData) => {
    try {
        const { materialID, no_of_materials, unit_Measure, date } = materialData;

        // Fetch reason 'sold' directly
        const reason = 'sold';
        console.log('reason:', reason);

        // Insert into rawMaterials_Out table with reason 'sold'
        const { error } = await supabase
            .from('rawMaterials_Out')
            .insert([{ materialID, no_of_materials, unit_Measure, date, reason }]);

        if (error) {
            throw new Error('Error inserting raw material out entry: ' + error.message);
        }
    } catch (error) {
        console.error('Error inserting raw material out entry:', error.message);
        throw new Error('Error inserting raw material out entry: ' + error.message);
    }
};
exports.insertRawMatOutMissing = async (materialData) => {
    try {
        for (const material of materialData) {
            // Assuming quantity_Checked and report_Date are derived or exist in `material`
            const { materialID, name, expectedQuantity, submittedQuantity, difference, unit_Measure, date_Report } = material;
            const { error } = await supabase
                .from('rawMaterials_Out')
                .insert([{
                    materialID,
                    no_of_materials:difference,
                    unit_Measure,
                    date : date_Report,
                    reason : 'missing'
                }]);
            if (error) {
                console.error('Error inserting into reports:', error.message);
                throw new Error(error.message);
            }
        }
    } catch (error) {
        console.error('Error inserting raw material out entry:', error.message);
        throw new Error('Error inserting raw material out entry: ' + error.message);
    }
};

exports.insertRawMatOutExpired = async (materialData) => {
    try {
        for (const material of materialData) {
            // Assuming quantity_Checked and report_Date are derived or exist in `material`
            const { materialID, expired_Quantity, unit_Measure, date_Report } = material;
            const { error } = await supabase
                .from('rawMaterials_Out')
                .insert([{
                    materialID,
                    no_of_materials:expired_Quantity,
                    unit_Measure,
                    date : date_Report,
                    reason : 'expired'
                }]);
            if (error) {
                console.error('Error inserting into reports:', error.message);
                throw new Error(error.message);
            }
        }
    } catch (error) {
        console.error('Error inserting raw material out entry:', error.message);
        throw new Error('Error inserting raw material out entry: ' + error.message);
    }
};

exports.getRawMatsOut_Reason = async (reason) => {
    try {
        // Fetch data from matsOut_reason table by reason
        const { data, error } = await supabase
            .from('matsOut_reason')
            .select('*')
            .eq('reason', reason);

        if (error) {
            console.error('Error searching for entry:', error.message);
            throw new Error('Error searching for entry: ' + error.message);
        }

        return data;
    } catch (error) {
        console.error('Error searching for entry:', error.message);
        throw new Error('Error searching for entry: ' + error.message);
    }
};

exports.getRawMatsOut_ID = async (materialID) => {
    // Fetch data from rawMaterials_Out table by materialID
    const{ data } = await supabase
    .from('rawMaterials_Out')
    .select('*')
    .eq('materialID', materialID);
    if (error) {
        console.error('Error seaching for entry');
        return null;
    }
    return data;
}

exports.getRawMatsOut_Date = async (date) => {
    // Fetch data from rawMaterials_Out table by date
    const{ data } = await supabase
    .from('rawMaterials_Out')
    .select('*')
    .eq('date', date);
    if (error) {
        console.error('Error seaching for entry');
        return null;
    }
    return data;
}

exports.getReasonSold = async () => {
    try {
        // Fetch reason 'sold' from matsOut_reason table
        const { data, error } = await supabase
            .from('matsOut_reason')
            .select('*')
            .eq('reason', 'sold');

        if (error) {
            throw new Error('Error fetching reason from matsOut_reason table: ' + error.message);
        }

        if (!data || data.length === 0) {
            throw new Error('Reason "sold" not found in matsOut_reason table');
        }

        // Return the fetched reason
        return data[0].reason;
    } catch (error) {
        console.error('Error fetching reason:', error.message);
        throw new Error('Error fetching reason: ' + error.message);
    }
};

exports.getRawMaterialsOutByID = async (materialID) => {
    // Fetch data from rawMaterials_Out table by materialID
    const { data } = await supabase
      .from('rawMaterials_Out')
      .select('*')
      .eq('materialID', materialID);
  
    return data;
};