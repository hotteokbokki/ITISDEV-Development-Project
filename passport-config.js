const bcrypt = require('bcrypt');
const passport = require('passport');
const LocalStrategy = require('passport-local').Strategy;

const { createClient } = require('@supabase/supabase-js');
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);
passport.use('local', new LocalStrategy(
  {
    usernameField: 'username',
    passwordField: 'password'
  },
  async (username, password, done) => {
    try {
      const { data, error } = await supabase
        .from('accounts')
        .select('*')
        .eq('username', username);

      if (error) {
        console.error('Error retrieving user from Supabase:', error.message);
        return done(error);
      }

      if (!data || data.length === 0) {
        console.log('User not found');
        return done(null, false);
      }

      const userData = data[0]; // Assuming you want to use the first user found
      const isPasswordValid = await bcrypt.compare(password, userData.password);
      
      if (isPasswordValid && userData.is_Active === true) {
        console.log('Authenticated Successfully! ');
        return done(null, userData);
      } else if (userData.is_Active === false){
        console.log('User Deactivated');
        return done(null, false);
      } else {
        console.log('Invalid Authentication');
        return done(null, false);
      }
    } catch (error) {
      console.error('Error authenticating user:', error.message);
      return done(error);
    }
  }
));

// Serialize and deserialize user
passport.serializeUser((user, done) => {
  console.log(user);
  console.log('UserID: ', user.accountID);
  try {
    // Ensure user object has an 'id' property
    if (!user.accountID) {
      throw new Error('User object does not have an ID');
    }
    done(null, user.accountID);
  } catch (error) {
    console.error('Error serializing user:', error.message);
    done(error);
  }
});

passport.deserializeUser(async (accountID, done) => {
  console.log('Deserializing User...');
  console.log('accountID: ', accountID);
  try {
    const { data, error } = await supabase
      .from('accounts')
      .select('*')
      .eq('accountID', accountID);

    if (error) {
      console.error('Error retrieving user by ID:', error.message);
      return done(error);
    }

    if (!data || data.length === 0) {
      return done(new Error('User not found'));
    }

    // Handle multiple records if more than one matches the accountID
    if (data.length > 1) {
      console.warn('Multiple users found with the same accountID. This might indicate a data inconsistency.');
    }

    // For simplicity, here we just use the first record found
    const userData = data[0];
    console.log('username: ', userData.username);

    return done(null, userData);
  } catch (error) {
    console.error('Error deserializing user:', error.message);
    return done(error);
  }
});
