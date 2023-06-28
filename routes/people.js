var express = require('express');
var router = express.Router();
const authorization = require("../middleware/authorization");


/* POST Retrieve person information if authorized. */
// WORKAROUND: NESTED PROMISES. CONSULT DOMAIN EXPERT
router.get('/:personID', authorization, (req, res) => {
  const personID = decodeURIComponent(req.params.personID);

  // Check for unknown person
  const personIDRegex = /^[A-Za-z0-9]+$/;
  if (!personID || !personID.match(personIDRegex)) {
    res.status(401).json({ "error": true, "message": "Authorization header ('Bearer token') not found" });
    return;
  }
  // Check for query parameters
  if (Object.keys(req.query).length !== 0) {
    res.status(400).json({ "error": true, "message": "Query parameters are not permitted." });
    return;
  }
  //Query names table, check if person exists
  var name, birthYear, deathYear;
  let queryFailed = false;
  req.db.from("names").select("*").where("nconst", "=", personID)
    .then(person => {
      if (person.length === 0) {
        res.status(404).json({ error: true, message: "No record exists of a person with this ID" });
        queryFailed = true;
        return;
      }
      name = person[0].primaryName;
      birthYear = person[0].birthYear;
      deathYear = person[0].deathYear ? person[0].deathYear : null;
      // Query principals table, map to a roles array
      // WORKAROUND as unnested the promises cause response header errors.
      // Refactor res.status(errors) to async/await and throw errors that res in catch.
      req.db.from("principals")
        .select("principals.nconst", "principals.tconst", "principals.category", "principals.characters")
        .where("principals.nconst", "=", personID)
        .join("basics", "principals.tconst", "=", "basics.tconst")
        .select("basics.primaryTitle", "basics.imdbRating")
        // Map rows to roles, form person response and return.
        .then((rows) => {
          const roles = rows.map(row => {
            const characters = row.characters.slice(1, -1).split(", ").map(character => character.replace(/"/g, ''));
            const mappedRow = {
              movieName: row.primaryTitle,
              movieId: row.tconst,
              category: row.category,
              characters: characters,
              imdbRating: parseFloat(row.imdbRating) || null
            };
            return mappedRow;
          });
          // Structure response and return it
          const person = {
            name,
            birthYear,
            deathYear,
            roles
          };
          res.status(200).json({ ...person })
        })
        .catch((err) => {
          console.error(`Error: ${err.message}`);
          res.status(500).json({ "Error": true, "Message": `Error: ${err.message}` });
        });
    })
    .catch((err) => {
      console.error(`Error: ${err.message}`);
      res.status(500).json({ "Error": true, "Message": `Error: ${err.message}` });
    });
});

module.exports = router;