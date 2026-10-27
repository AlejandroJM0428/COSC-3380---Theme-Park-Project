// Registers the data-entry routes for the pages that used to say "not built yet".
// Each import runs that file's route(...) calls. Imported from routes/demos.js so server/index.js is not touched;
// if you prefer, move these lines into server/index.js with the other route imports.
import './customers.js';
import './memberships.js';
import './purchases.js';
import './gameplays.js';
import './ridelog.js';
import './weather.js';
