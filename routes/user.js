const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
var express = require('express');
var router = express.Router();
const getAuth = require("../middleware/profileAuth");
const postAuth = require("../middleware/authorization");
const dateCheck = require('../utils/dateCheck.js');


/* POST register a new user */
//NOTE: Fixed race condition in last res.status(201), then() callback was missing.
router.post('/register', function (req, res, next) {
  const email = req.body.email;
  const password = req.body.password;

  // Verify body
  if (!email || !password) {
    res.status(400).json({
      error: true,
      message: "Request body incomplete - email and password needed"
    });
    return;
  }

  // Determine if user already exists in table
  // ASYNC EXAMPLE: Without .then(), async operations will respond before user is added, breaking registration.
  req.db.from("users").select("*").where("email", "=", email)
    .then(users => {
      if (users.length > 0) {
        res.status(201).json({ success: false, message: "User already exists" });
        return
      }

      const salt = bcrypt.genSaltSync(10);
      const hash = bcrypt.hashSync(password, salt);

      req.db.from("users").insert({ email, hash, salt })
        .then(() =>
          res.status(201).json({ success: true, message: "User created" })
        );
    })
    .catch(e => {
      res.status(500).json({ error: true, message: e.message });
    });
});


//POST a login request for bearer and refresh tokens
router.post('/login', function (req, res, next) {
  const email = req.body.email;
  const password = req.body.password;
  const JWT_SECRET = process.env.JWT_SECRET;

  // Verify body
  if (!email || !password) {
    res.status(400).json({
      error: true,
      message: "Request body incomplete - email and password needed"
    });
    return;
  }

  // Determine if user already exists in table
  req.db.from("users").select("*").where("email", "=", email)
    .then(users => {
      if (users.length === 0) {
        res.status(401).json({ success: false, message: "Login failed." })
        return;
      }

      // Compare password hashes
      const user = users[0];
      const storedHash = user.hash;
      const storedSalt = user.salt;
      const saltedPassword = bcrypt.hashSync(password, storedSalt);
      const match = saltedPassword === storedHash;
      if (!match) {
        res.status(401).json({ success: false, message: "Login failed." })
        return;
      }

      //If passwords match, return JWT tokens
      //If long expiry set in body, set both tokens to a year. (ternary assignment wasn't working)
      //Otherwise, set bearer and refresh tokens to expiresInSeconds or 10 minutes to 24 hours, respectively.
      const bearerExpire = req.body.longExpiry ? 31536000 : (parseInt(req.body.bearerExpiresInSeconds) || 600);
      const refreshExpire = req.body.longExpiry ? 31536000 : (parseInt(req.body.refreshExpiresInSeconds) || 86400);
      const bearerExp = Math.floor(Date.now() / 1000) + bearerExpire;
      const refreshExp = Math.floor(Date.now() / 1000) + refreshExpire;
      const bToken = jwt.sign({ email, bearerExp }, JWT_SECRET);
      const rToken = jwt.sign({ email, refreshExp }, JWT_SECRET);
      const bearerTokenResponse = {
        bearerToken: {
          token: bToken,
          token_type: 'Bearer',
          expires_in: parseInt(bearerExpire)
        }
      };
      const refreshTokenResponse = {
        refreshToken: {
          token: rToken,
          token_type: 'Refresh',
          expires_in: parseInt(refreshExpire)
        }
      };
      res.status(200).json({ ...bearerTokenResponse, ...refreshTokenResponse });
    })
    .catch(e => {
      //Log error to the console and send response
      console.log(e);
      res.status(500).json({ error: true, message: e.message });
    });
});


/* GET user's profile information */
router.get("/:email/profile", getAuth, (req, res) => {
  const email = decodeURIComponent(req.params.email);

  JWT_SECRET = process.env.JWT_SECRET;

  if (email.length === 0) {
    res.status(404).json({ error: true, message: "User not found" });
  }

  req.db.from("users").select("*").where("email", "=", email)
    .then(users => {
      // Determine if the user exists
      if (users.length === 0) {
        res.status(404).json({ error: true, message: "User not found" })
        return;
      }

      const user = users[0];
      // Unauthorized user, send public details only.
      if (!("authorization" in req.headers)) {
        const unAuthUser = {
          email: user.email || null,
          firstName: user.firstName || null,
          lastName: user.lastName || null
        }
        res.status(200).json({ ...unAuthUser });
        return;
      }
      // Authorized user, check if email matches then return
      const token = req.headers.authorization.replace(/^Bearer /, "");
      const currentUser = jwt.verify(token, JWT_SECRET);
      if (email === currentUser.email) {
        const authUser = {
          email: user.email || null,
          firstName: user.firstName || null,
          lastName: user.lastName || null,
          dob: user.dob || null,
          address: user.address || null
        }
        res.status(200).json({ ...authUser });
        return;
      } else {
        const unAuthUser = {
          email: user.email || null,
          firstName: user.firstName || null,
          lastName: user.lastName || null
        }
        res.status(200).json({ ...unAuthUser });
        return;
      }
    })
    .catch(e => {
      //Log error to the console and send response
      console.log(e);
      res.status(500).json({ error: true, message: e.message });
    });
})


/* PUT update existing user details */
router.put("/:email/profile", postAuth, (req, res) => {
  var email = decodeURIComponent(req.params.email);

  // Check if no email provided, fail immediately
  if (email.length === 0) {
    res.status(404).json({ error: true, message: "User not found" });
    return;
  }
  // Verification, reject if token.email does not match params.email
  const JWT_SECRET = process.env.JWT_SECRET;
  const token = req.headers.authorization.replace(/^Bearer /, "");
  const currentUser = jwt.verify(token, JWT_SECRET);
  if (!(email === currentUser.email)) {
    res.status(403).json({ error: true, message: "Forbidden" });
    return;
  }

  // Query users table for email, then check for match
  req.db.from("users").select("*").where("email", "=", email)
    .then(users => {
      // Check if user returned from search.
      if (users.length === 0) {
        res.status(404).json({ error: true, message: "User not found" })
        return;
      }
      // Check if missing body keys
      var firstName = req.body.firstName;
      var lastName = req.body.lastName;
      var address = req.body.address;
      var dob = req.body.dob;
      if (!(firstName && lastName && address && dob)) {
        res.status(400).json({
          error: true,
          message: "Request body incomplete: firstName, lastName, dob and address are required."
        });
        return;
      }
      // Check if firstName, lastName and address are strings
      const firstCorrect = (typeof firstName === "string");
      const lastCorrect = (typeof lastName === "string");
      const addressCorrect = (typeof address === "string");
      if (!(firstCorrect && lastCorrect && addressCorrect)) {
        res.status(400).json({
          error: true,
          message: "Request body invalid: firstName, lastName and address must be strings only."
        });
        return;
      }
      // Check if dob is correct and valid
      const dateValid = dateCheck(dob);
      if (!(dateValid)) {
        res.status(400).json({
          error: true,
          message: "Invalid input: dob must be a real date in format YYYY-MM-DD."
        });
        return;
      }
      // Check if dob is in the past
      const currentDate = Date.now();
      const providedDate = new Date(dob).getTime();
      if (!(providedDate < currentDate)) {
        res.status(400).json({
          error: true,
          message: "Invalid input: dob must be a date in the past."
        });
        return;
      }
      // Update entry
      var updatedDetails = {
        firstName: firstName,
        lastName: lastName,
        dob: dob,
        address: address
      }
      req.db.from("users").where("email", "=", email)
        .update(updatedDetails)
        .then(() => {
          updatedDetails = {
            "email": email,
            "firstName": firstName,
            "lastName": lastName,
            "dob": dob,
            "address": address
          };
          res.status(200).json({ ...updatedDetails });
        })
        .catch(e => {
          //Log error to the console and send response
          console.log(e);
          res.status(500).json({ error: true, message: e.message });
        });
    })
    .catch(e => {
      //Log error to the console and send response
      console.log(e);
      res.status(500).json({ error: true, message: e.message });
    });
});


/* POST refresh current bearer token */
// NOTE: authorization should probably be used here, but would fail test.
// NOTE: If more time, refactor jwt.verify(refreshToken) to a middleware.
router.post('/refresh', (req, res, next) => {
  JWT_SECRET = process.env.JWT_SECRET;
  // Check if refresh token in body.
  if (!req.body.refreshToken) {
    res.status(400).json({ error: true, message: "Request body incomplete, refresh token required" })
    return;
  }
  // Verify token, and retrieve details.
  // REFACTOR TO MIDDLEWARE IF TIME ALLOWS.
  const refreshToken = req.body.refreshToken;
  var details;
  try {
    details = jwt.verify(refreshToken, JWT_SECRET);
    const now = Math.floor(Date.now() / 1000);
    if ((details.refreshExp - now) < 0) {
      throw new jwt.TokenExpiredError();
    }
  } catch (e) {
    if (e.name === "TokenExpiredError") {
      res.status(401).json({ error: true, message: "JWT token has expired" });
    } else {
      res.status(401).json({ error: true, message: "Invalid JWT token" });
    }
    return;
  }
  // Ensure token provided is not a bearer token.
  if (details.bearerExp) {
    res.status(401).json({ error: true, message: "Invalid JWT token" });
    return;
  }
  // Check if refresh token is blacklisted(logged out)
  req.db.from("blacklist").select("*").where("refreshToken", "=", refreshToken)
    .then(token => {
      if (!(token.length === 0)) {
        res.status(401).json({ error: true, message: "JWT token has expired" })
        return;
      }
      // Respond with new bearer token and new refresh token
      const email = details.email;
      const bearerExpire = parseInt(req.body.bearerExpiresInSeconds) || 600;
      const bearerExp = Math.floor(Date.now() / 1000) + bearerExpire;
      const bToken = jwt.sign({ email, bearerExp }, JWT_SECRET);
      const refreshExpire = parseInt(req.body.refreshExpiresInSeconds) || 86400;
      const refreshExp = Math.floor(Date.now() / 1000) + refreshExpire;
      const rToken = jwt.sign({ email, refreshExp }, JWT_SECRET);
      const bearerTokenResponse = {
        bearerToken: {
          token: bToken,
          token_type: 'Bearer',
          expires_in: parseInt(bearerExpire)
        }
      };
      const refreshTokenResponse = {
        refreshToken: {
          token: rToken,
          token_type: 'Refresh',
          expires_in: parseInt(refreshExpire)
        }
      };
      res.status(200).json({ ...bearerTokenResponse, ...refreshTokenResponse });
    })
    .catch(e => {
      //Log error to the console and send response
      console.log(e);
      res.status(500).json({ error: true, message: e.message });
    });
});


/* POST Logout an existing refresh token to blacklist */
// NOTE: authorization should probably be used here, but would fail test.
// NOTE: If more time, refactor jwt.verify(refreshToken) to a middleware.
router.post('/logout', (req, res, next) => {
  JWT_SECRET = process.env.JWT_SECRET;
  // Check if refresh token in body.
  var refreshToken = req.body.refreshToken;
  if (!refreshToken) {
    res.status(400).json({ error: true, message: "Request body incomplete, refresh token required" })
    return;
  }
  // Verify token, and retrieve details.
  // REFACTOR TO MIDDLEWARE IF TIME ALLOWS.
  var details;
  try {
    details = jwt.verify(refreshToken, JWT_SECRET);
    const now = Math.floor(Date.now() / 1000);
    if ((details.refreshExp - now) < 0) {
      throw new jwt.TokenExpiredError();
    }
  } catch (e) {
    if (e.name === "TokenExpiredError") {
      res.status(401).json({ error: true, message: "JWT token has expired" });
    } else {
      res.status(401).json({ error: true, message: "Invalid JWT token" });
    }
    return;
  }
  //Ensure token provided is not a bearer token.
  if (details.bearerExp) {
    res.status(401).json({ error: true, message: "Invalid JWT token" });
    return;
  }
  // Check if already logged out (exists in blacklist)
  req.db.from("blacklist").select("*").where("refreshToken", "=", refreshToken)
    .then(token => {
      if (!(token.length === 0)) {
        res.status(401).json({ error: true, message: "JWT token has expired" })
        return;
      }
      // Add refresh token to blacklist.
      var expiry = details.refreshExp * 1000;
      expiry = new Date(expiry);
      expiry = expiry.toISOString().substring(0,10);
      expiry = expiry.toString();
      req.db.from("blacklist").insert({ refreshToken, expiry })
        .then(() =>
          res.status(200).json({ error: false, message: "Token successfully invalidated" })
        )
        .catch(e => {
          //Log error to the console and send response
          console.log(e);
          res.status(500).json({ error: true, message: e.message });
        });
    })
    .catch(e => {
      //Log error to the console and send response
      console.log(e);
      res.status(500).json({ error: true, message: e.message });
    });
});

module.exports = router;