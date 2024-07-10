const supabase = require('../supabase.js');

exports.getRoles = async () => {
  try {
    // Fetch roles from the 'positions' table
    const { data: roles, error } = await supabase.from('positions').select('position');
    if (error) {
      throw new Error(error.message);
    }
    return roles;
  } catch (error) {
    console.error('Error fetching roles:', error.message);
    throw error;
  }
};
