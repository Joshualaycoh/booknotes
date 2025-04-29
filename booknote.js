import express from "express";
import bodyParser from "body-parser";
import pg from "pg";
import bcrypt from "bcrypt";
import session from "express-session";
import passport from "passport";
import { Strategy } from "passport-local";
import GoogleStrategy from "passport-google-oauth2";
import env from "dotenv";
import multer from "multer";
import path from "path";

const app = express();
const port = process.env.PORT || 3000;
const saltRounds = 12;
env.config();

const db = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false, // Necessary for Render's SSL
  },
});

db.connect();

const storage = multer.diskStorage({
  destination: './public/images',
  filename: (req, file, cb) => {
    cb(null, `${file.fieldname}_${Date.now()}${path.extname(file.originalname)}`);
  },
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 10000000,
  },
});

app.use(express.static("public"));
app.use(bodyParser.urlencoded({ extended: true }));

app.use(session({
  secret: "TOPSECRETWORD",
  resave: false,
  saveUninitialized: true,
  cookie: {
    maxAge: 1000 * 60 * 60 * 24,
  },
}));

app.use(passport.initialize());
app.use(passport.session());
app.use('/profile', express.static('public/images'));

let currentBookId = 1;
let currentUserId = 2;
let titles = [];

// Helper functions
async function checkNotes() {
  const result = await db.query(
    "SELECT * FROM notes JOIN title ON title.id=title_id WHERE title_id=$1 ORDER BY note_id",
    [currentBookId]
  );
  return result.rows;
}


async function getCurrentBook() {
  const result = await db.query(
    "SELECT * FROM title JOIN users ON users.users_id=user_id WHERE users_id=$1 ORDER BY title.id DESC", // Order by id descending
    [currentUserId]
  );
  titles = result.rows; // Store the ordered books
  return titles; // Return the books ordered from latest to oldest
}



// Routes
app.get("/", (req, res) => {
  res.render("home.ejs");
});

app.get("/register", (req, res) => {
  res.render("register.ejs");
});

app.get("/logout", (req, res, next) => {
  req.logout(function (err) {
    if (err) {
      return next(err);
    }
    res.redirect("/");
  });
});

app.get("/login", (req, res) => {
  res.render("login.ejs");
});

app.get("/index", async (req, res) => {
  if (req.isAuthenticated()) {
    currentUserId = req.user.users_id;
    const currentBooks = await getCurrentBook();
    res.render("index.ejs", {
      titles: titles, 
    });
  } else {
    res.redirect("/login");
  }
});


app.get("/notes", async (req, res) => {
  if (req.isAuthenticated()) {
    const booknote = await checkNotes();
    res.render("notes.ejs", {
      booknote: booknote,
    });
  } else {
    res.redirect("/login");
  }
});

app.get("/create", (req, res) => {
  if (req.isAuthenticated()) {
    res.render("create.ejs");
  } else {
    res.redirect("/login");
  }
});

app.get("/about", (req, res) => {
  if (req.isAuthenticated()) {
    res.render("about.ejs");
  } else {
    res.redirect("/login");
  }
});

app.get("/auth/google", passport.authenticate("google", {
  scope: ["profile", "email"],
}));

app.get("/auth/google/index", passport.authenticate("google", {
  successRedirect: "/index",
  failureRedirect: "/login",
}));

app.post(
  "/login",
  passport.authenticate("local", {
    successRedirect: "/index",
    failureRedirect: "/login",
  }),
  (req, res) => {
    console.log("Login post request");
  }
);

app.post("/book", async (req, res) => {
  if (req.body.booknotes) {
    currentBookId = req.body.booknotes;
    res.redirect("/notes");
  } else {
    res.redirect("/index");
  }
});

app.post("/create", upload.single('profile'), async (req, res) => {
  const profile = req.file.filename;
  const title = req.body.title;
  const rating = req.body.rating;
  const overview = req.body.overview;
  const notes = req.body.notes;

  const result = await db.query(
    "INSERT INTO title (book_title, rating, overview, profile, user_id) VALUES($1,$2,$3,$4,$5) RETURNING id",
    [title, rating, overview, profile, req.user.users_id]
  );

  const id = result.rows[0].id;

  await db.query(
    "INSERT INTO notes (notes, title_id) VALUES($1,$2)",
    [notes, id]
  );

  res.redirect("/index");
});

app.post("/add", async (req, res) => {
  const notes = req.body.addNote;

  await db.query("INSERT INTO notes (notes, title_id) VALUES($1,$2)",
    [notes, currentBookId]
  );

  res.redirect("/notes");
});

app.post("/deleteBook", async (req, res) => {
  const deletedID = req.body.deletebook;
  await db.query("DELETE FROM title WHERE id=$1",
    [deletedID]
  );
  res.redirect("/index");
});

app.post("/modify", async (req, res) => {
  const deletePara = req.body.deletePara;
  await db.query("DELETE FROM notes WHERE note_id=$1",
    [deletePara]
  );

  res.redirect("/notes");
});

app.post("/editDetails", async (req, res) => {
  const id = req.body.updatedDetailsId;
  const title = req.body.editTitle;
  const rating = req.body.editRating;
  const overview = req.body.editOverview;

  await db.query("UPDATE title SET book_title = $1, rating = $2, overview = $3 WHERE id = $4",
    [title, rating, overview, id]
  );
  res.redirect("/notes");
});

app.post("/changePhoto", upload.single('profile'), async (req, res) => {
  const profile = req.file.filename;
  const id = req.body.updatedPhotoID;

  await db.query("UPDATE title SET profile = $1 WHERE id = $2",
    [profile, id]
  );
  res.redirect("/notes");
});

// app.get("/update", async (req, res) => {
//   if (req.isAuthenticated()) {
//     const booknote = await checkNotes();
//     res.render("update.ejs", { booknote: booknote });
//   } else {
//     res.redirect("/login");
//   }
// });


// app.post("/change", async (req, res) => {
//   const booknote = await checkNotes();
//   if (req.body.changePhoto === "change") {
//     res.render("update.ejs", { booknote: booknote });
//   } else {
//     res.redirect("/notes");
//   }
// });

app.post("/updatePara", async (req, res) => {
  const item = req.body.updatedItemTitle;
  const id = req.body.updatedItemId;

  await db.query("UPDATE notes SET notes = $1 WHERE note_id = $2", [item, id]);
  res.redirect("/notes");
});

app.post("/register", async (req, res) => {
  const email = req.body.username;
  const password = req.body.password;

  try {
    const checkResult = await db.query("SELECT * FROM users WHERE email = $1", [email]);
    if (checkResult.rows.length > 0) {
      res.send("Email already exists. Try logging in.");
    } else {
      bcrypt.hash(password, saltRounds, async (err, hash) => {
        if (err) {
          console.error("Error hashing password:", err);
        } else {
          const result = await db.query(
            "INSERT INTO users (email, password) VALUES ($1, $2) RETURNING *",
            [email, hash]
          );
          const user = result.rows[0];
          req.login(user, (err) => {
            if (err) {
              console.log(err);
            }
            res.redirect("/index");
          });
        }
      });
    }
  } catch (err) {
    console.log(err);
  }
});

passport.use(
  "local",
  new Strategy(async function verify(username, password, cb) {
    try {
      const result = await db.query("SELECT * FROM users WHERE email = $1", [username]);
      if (result.rows.length > 0) {
        const user = result.rows[0];
        const storedHashedPassword = user.password;
        bcrypt.compare(password, storedHashedPassword, (err, result) => {
          if (err) {
            return cb(err);
          }
          if (result) {
            return cb(null, user);
          } else {
            return cb(null, false, { message: 'Incorrect password.' });
          }
        });
      } else {
        return cb(null, false, { message: "User not found." });
      }
    } catch (err) {
      return cb(err);
    }
  })
);

passport.use("google", new GoogleStrategy({
  clientID: process.env.GOOGLE_CLIENT_ID,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  callbackURL: "https://your-railway-app.up.railway.app/auth/google/index",

}, async (accessToken, refreshToken, profile, cb) => {
  try {
    console.log(profile);
    const result = await db.query("SELECT * FROM users WHERE email = $1", [
      profile.email,
    ]);
    if (result.rows.length === 0) {
      const newUser = await db.query(
        "INSERT INTO users (email, password) VALUES ($1, $2) RETURNING *",
        [profile.email, "google"]
      );
      return cb(null, newUser.rows[0]);
    } else {
      // Already existing user
      return cb(null, result.rows[0]);
    }
  } catch (err) {
    return cb(err);
  }
}));

passport.serializeUser((user, cb) => {
  cb(null, user);
});

passport.deserializeUser((user, cb) => {
  cb(null, user);
});

// Middleware to handle errors
function errHandler(err, req, res, next) {
  if (err instanceof multer.MulterError) {
    res.json({
      success: 0,
      message: err.message,
    });
  } else {
    next(err);
  }
}

app.use(errHandler);

// Start server
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});

