const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST || "smtp.gmail.com",
  port: 587, secure: false,
  auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
});

const sendMail = async (to, subject, html) => {
  if (!process.env.EMAIL_USER) { console.log("[Mail skipped]"); return; }
  await transporter.sendMail({ from: '"School SMS" <' + process.env.EMAIL_USER + '>', to, subject, html });
};

exports.sendOTPMail = (to, otp) => sendMail(to, "OTP Verification",
  '<div style="font-family:sans-serif;padding:24px"><h2 style="color:#4F46E5">Your OTP</h2><h1 style="letter-spacing:8px">' + otp + '</h1><p>Valid 5 minutes.</p></div>');

exports.sendCredentialsMail = (to, data) => sendMail(to, "Your Account Credentials",
  '<div style="font-family:sans-serif;padding:24px"><h2>Welcome ' + data.name + '</h2><p>ID: <b>' + data.userId + '</b></p><p>Email: <b>' + data.email + '</b></p><p>Password: <b>' + data.password + '</b></p><p style="color:red">Change password after login.</p></div>');

exports.sendPasswordResetMail = (to, otp) => sendMail(to, "Password Reset OTP",
  '<div style="font-family:sans-serif;padding:24px"><h2>Reset OTP</h2><h1 style="letter-spacing:8px">' + otp + '</h1><p>Valid 5 minutes.</p></div>');

exports.sendAbsentAlertMail = (to, name, date) => sendMail(to, "Absence Alert - " + name,
  '<div style="font-family:sans-serif;padding:24px"><h2 style="color:red">Absence Alert</h2><p>Your child <b>' + name + '</b> was absent on <b>' + date + '</b>.</p></div>');
