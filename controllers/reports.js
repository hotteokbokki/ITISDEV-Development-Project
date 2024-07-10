const supabase = require('../supabase.js');

exports.insertDiscrepancyReport = async (discrepancies) => {

    for (const material of discrepancies) {
        // Assuming quantity_Checked and report_Date are derived or exist in `material`
        const { materialID, name, expectedQuantity, submittedQuantity, difference, unit_Measure, date_Report } = material;
        const { error } = await supabase
            .from('reports')
            .insert([{
                materialID,
                name,
                expectedQuantity,
                submittedQuantity,
                difference,
                unit_Measure,
                date_Report
            }]);
        if (error) {
            console.error('Error inserting into reports:', error.message);
            throw new Error(error.message);
        }
    }
};

exports.getDiscrepancyReports = async () => {
    // Fetch all reports from the 'reports' table
    const { data: reports, error: reportsError } = await supabase
    .from('reports')
    .select('*');

  if (reportsError) {
    throw new Error('Error fetching raw materials data');
  }
  return reports;
};
