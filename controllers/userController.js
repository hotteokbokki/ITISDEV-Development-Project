const supabase = require('../supabase.js'); // Import supabase instance

exports.getUserlist = async () => {
    try {
        // Fetch the list of users from the 'accounts' table using supabase
        const { data: userList, error } = await supabase.from('accounts').select('*');

        if (error) {
            throw new Error(error.message);
        }

        return userList;
    } catch (error) {
        console.error('Error fetching user list:', error.message);
        throw error;
    }
};

exports.toggleUserActivation = async (accountID, is_Active) => {
  try {
      // Update the user with the given accountID to toggle is_Active
      const { data, error } = await supabase
          .from('accounts')
          .update({ is_Active: !is_Active }) // Here we are toggling the is_Active status
          .eq('accountID', accountID);

      if (error) {
          throw new Error(error.message);
      }

      return data;
  } catch (error) {
      console.error('Error toggling user activation:', error.message);
      throw error;
  }
};


exports.createUsers = async (userData) => {
    try {
        const { username, first_name, last_name, password, position, email } = userData;

        // Account activation is automatically active after creating account.
        const is_Active = true;

        // Insert new user data into the 'accounts' table
        const { data, error } = await supabase.from('accounts').insert([
            { username, first_name, last_name, password, is_Active, position, email },
        ]);

        if (error) {
            throw new Error(error.message);
        }

        return data;
    } catch (error) {
        console.error('Error creating user:', error.message);
        throw error;
    }
};
