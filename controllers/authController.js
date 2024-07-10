const supabase = require('../supabase'); // create a supabase.js file to initialize supabase

exports.signup_get = (req, res) => {
  res.render('signup');
};

exports.signup_post = async (req, res) => {
  // Implement user signup logic here using supabase
  // Insert a new user into the 'users' table
  // Redirect to the userlist or a dashboard after successful signup
};

exports.signin_get = (req, res) => {
  res.render('signin');
};

exports.signin_post = async (req, res) => {
 // Implement user signin logic here using supabase
  // Redirect to the userlist or a dashboard after successful signin

};
