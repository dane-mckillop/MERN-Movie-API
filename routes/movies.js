var express = require('express');
var router = express.Router();


/* GET movies matching query parameters in URL */
router.get("/search", function (req, res, next) {
    const allowedParams = ["title", "year", "page"];
    const title = decodeURIComponent(req.query.title);

    // Check for unknown parameters
    const unknownParams = Object.keys(req.query).filter(param => !allowedParams.includes(param));
    if (unknownParams.length > 0) {
        res.status(400).json({ "Error": true, "Message": "Invalid query parameters" });
        return;
    }
    // Validate title
    if (title) {
        const titleRegex = /^[^.;\\/|\'\"\`]*$/;  // Disallowed characters

        if (!titleRegex.test(title)) {
            return res.status(400).json({ error: true, message: 'Invalid title. Please remove disallowed characters.' });
        }
    }
    // Validate year
    if (req.query.year) {
        const yearRegex = /^\d{4}$/;

        if (!yearRegex.test(req.query.year)) {
            return res.status(400).json({ error: true, message: "Invalid year format. Format must be yyyy." });
        }
    }
    // Validate page
    if (req.query.page) {
        const pageRegex = /^\d+$/;
        if (!pageRegex.test(req.query.page)) {
            return res.status(400).json({ error: true, message: "Invalid page format. page must be a number." });
        }
    }

    //WORKAROUND TO knex-paginate .paginate(...) NOT POPULATING CORRECTLY
    //If req.query.page is provided, paginate information is incomplete
    //Flagged on GitHub, when knex-paginate fixed patch this section.
    var countNumber = 0;
    req.db.from('basics')
        .count("* as count")
        .where(function () {
            if (req.query.title && req.query.year) {
                this.where('primaryTitle', 'like', `%${title}%`)
                    .andWhere('year', '=', req.query.year);
            } else if (req.query.title) {
                this.where('primaryTitle', 'like', `%${title}%`);
            } else if (req.query.year) {
                this.where('year', '=', req.query.year);
            }
            else {
                //No parameters
            }
        })
        .then(result => {
            //Assign count for total count for correct pagination.
            countNumber = result[0].count;

            //Movies matching parameters
            const query = req.db.from('basics')
                .select("*")
                .where(function () {
                    if (req.query.title && req.query.year) {
                        this.where('primaryTitle', 'like', `%${title}%`)
                            .andWhere('year', '=', req.query.year);
                    } else if (req.query.title) {
                        this.where('primaryTitle', 'like', `%${title}%`);
                    } else if (req.query.year) {
                        this.where('year', '=', req.query.year);
                    }
                    else {
                        //No parameters
                    }
                })
                //Pagination and response
                .paginate({ perPage: 100, currentPage: req.query.page || 1 })
                .then((paginationResult) => {
                    //Movie data
                    const rows = paginationResult.data;
                    const data = rows.map(row => {
                        const mappedRow = {
                            title: row.primaryTitle,
                            year: parseInt(row.year),
                            imdbID: row.tconst,
                            imdbRating: parseFloat(row.imdbRating),
                            rottenTomatoesRating: parseInt(row.rottentomatoesRating),
                            metacriticRating: parseInt(row.metacriticRating),
                            classification: row.rated
                        };
                        return mappedRow;
                    });
                    //Pagination information
                    // (WORKAROUND FOR NOW, CHECK knex-paginate .paginate(...) fixes)
                    const currentPage = req.query.page ? parseInt(req.query.page) : 1;
                    const lastPage = Math.ceil(countNumber / paginationResult.pagination.perPage);
                    const prevPage = currentPage > 1 ? currentPage - 1 : null;
                    const nextPage = currentPage < lastPage ? currentPage + 1 : null;
                    const pagination = {
                        total: countNumber || 0,
                        lastPage: lastPage || 0,
                        prevPage: prevPage,
                        nextPage: nextPage,
                        perPage: paginationResult.pagination.perPage || 100,
                        currentPage: currentPage,
                        from: paginationResult.pagination.from || 0,
                        to: paginationResult.pagination.to || 0
                    };

                    res.status(200).json({ "Error": false, "Message": "Success", "data": data, pagination });
                })
                .catch((err) => {
                    console.log(err);
                    res.status(500).json({ "Error": true, "Message": `Error: ${err.message}` });
                });
        })
        .catch((err) => {
            console.log(err);
            res.status(500).json({ "Error": true, "Message": `Error: ${err.message}` });
        });
});


/* GET movie details matching imdbID provided in URL */
router.get("/data/:imdbID", function (req, res, next) {
    const imdbID = req.params.imdbID;

    // Check for unknown parameters
    const imdbIDRegex = /^[A-Za-z0-9]+$/;
    if (!req.params.imdbID || !imdbID.match(imdbIDRegex) || Object.keys(req.query).length !== 0) {
        res.status(400).json({ "error": true, "message": "Query parameters are not permitted." });
        return;
    }

    //Movie data query
    const query = req.db.from('basics')
        .select("*")
        .where('tconst', '=', imdbID);

    //Principals data query
    const principalsQuery = req.db.from('principals')
        .select("*")
        .where("tconst", "=", imdbID);

    // Execute both queries concurrently
    Promise.all([query, principalsQuery])
        .then(([movieResult, principalsResult]) => {
            if (movieResult.length === 0) {
                res.status(404).json({ "error": true, "message": "No record exists of a movie with this ID" });
                return;
            }

            const movie = movieResult[0];

            const principals = principalsResult.map(row => {
                const characters = row.characters.slice(1, -1).split(", ").map(character => character.replace(/"/g, ''));
                return {
                    id: row.nconst,
                    category: row.category,
                    name: row.name,
                    characters: characters
                };
            });

            const data = {
                title: movie.primaryTitle,
                year: parseInt(movie.year),
                runtime: parseInt(movie.runtimeMinutes),
                genres: movie.genres.split(","),
                country: movie.country,
                principals: principals,
                ratings: [
                    { source: "Internet Movie Database", value: parseFloat(movie.imdbRating) },
                    { source: "Rotten Tomatoes", value: parseInt(movie.rottentomatoesRating) },
                    { source: "Metacritic", value: parseInt(movie.metacriticRating) }
                ],
                boxoffice: parseInt(movie.boxoffice),
                poster: movie.poster,
                plot: movie.plot
            };

            res.json(data);
        })
        .catch((err) => {
            console.error(`Error: ${err.message}`);
            res.status(500).json({ "Error": true, "Message": `Error: ${err.message}` });
        });
});

module.exports = router;