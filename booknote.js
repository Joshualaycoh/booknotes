import express from "express";
import bodyParser from "body-parser";
import pg from "pg";
import bcrypt from "bcrypt";
import session from "express-session";
import passport from "passport";
import { Strategy } from "passport-local";
import GoogleStrategy from "passport-google-oauth2";
import env from "dotenv";

const app = express();
const port = 3000;
const saltRounds = 12;
env.config();

const db = new pg.Client({
  user: process.env.PG_USER,
  host: process.env.PG_HOST,
  database: process.env.PG_DATABASE,
  password: process.env.PG_PASSWORD,
  port: process.env.PG_PORT,
});

db.connect();

app.use(express.static("public"));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(session({
secret:"TOPSECRETWORD",
resave: false,
saveUninitialized: true,
cookie : {
  maxAge: 1000 * 60 * 60 * 24
}
})
);

app.use(passport.initialize());
app.use(passport.session());


let currentBookId = 1;
let currentUserId = 2;
let titles = [];


async function checkNotes() {
  const result = await db.query(
    "SELECT * FROM notes JOIN title ON title.id=title_id WHERE title_id=$1 ORDER BY note_id",
  [currentBookId]
  );
  const booknote = result.rows;
  return booknote;
};

async function getCurrentBook() {
  const result = await db.query(
    "SELECT * FROM title JOIN users ON users.users_id=user_id WHERE users_id=$1",
    [currentUserId]
  );
  titles = result.rows;
  return titles.find((title) => title.users_id == currentBookId);
};

app.get("/", (req, res) => {
  res.render("home.ejs")
});

app.get("/register", (req, res) => {
  res.render("register.ejs")
});

app.get("/logout", (req, res) => {
  req.logout(function (err) {
    if (err) {
      return next(err);
    }
    res.redirect("/");
  });
});

app.get("/login", (req, res) => {
  res.render("login.ejs")
});

app.get("/index", async(req, res) => {
 console.log(req.user.users_id)
   currentUserId = req.user.users_id;

  if (req.isAuthenticated) {
  const currentBooks = await getCurrentBook();
  res.render("index.ejs",{
    titles: titles,
    details: currentBooks,
  });
} else {
  req.redirect("/login")
}



});

app.get("/notes", async(req, res) => {
  const booknote = await checkNotes();
  if (req.isAuthenticated) {
  res.render("notes.ejs",{
   booknote: booknote,
  });
} else {
  req.redirect("/login")
}
})

app.get("/create",(req, res) => {
  if (req.isAuthenticated) {
  res.render("create.ejs")
  } else {
  req.redirect("/login")
  }
})

app.get("/about",(req, res) => {
  if (req.isAuthenticated) {
  res.render("about.ejs")
   } else {
  req.redirect("/login")
  }
})

app.get("/auth/google", passport.authenticate("google", {
  scope: ["profile", "email"],
})
)

app.get("/auth/google/index", passport.authenticate("google",{
  successRedirect: "/index",
  failureRedirect: "/login"
})
);


app.post("/login", passport.authenticate("local",{
 successRedirect: "/index",
 failureRedirect: "/login"
})
);


app.post("/book", async(req, res) => {;
  const booknotes = req.body.booknotes;
  if (booknotes) {
    currentBookId = req.body.booknotes;
    res.redirect("/notes")
  } else {
    res.redirect("/index");
  }
})

app.post("/create", async(req,res) => {
  const title = req.body.title;
  const rating = req.body.rating;
  const overview = req.body.overview;
  const notes = req.body.notes;

  const result = await db.query(
    "INSERT INTO title (book_title, rating, overview, user_id) VALUES($1,$2,$3,$4) RETURNING id",
  [title, rating, overview, req.user.users_id]
  );

 const id = result.rows[0].id;

  await db.query(
    "INSERT INTO notes (notes, title_id) VALUES($1,$2)",
    [notes, id]
  );
 
  res.redirect("/index")

})

app.post("/add", async(req,res) => {
  const notes = req.body.addNote;
  
  await  db.query("INSERT INTO notes (notes, title_id) VALUES($1,$2)",
    [notes, currentBookId]
  );

  res.redirect("/notes")

})

app.post("/deleteBook", async(req, res) => {
  const deletedID = req.body.deletebook;
  await db.query("DELETE FROM title WHERE id=$1",
    [deletedID]
  );
  res.redirect("/index")
})

app.post("/modify", async(req,res) => {
  const deletePara = req.body.deletePara;
  await db.query("DELETE FROM notes WHERE note_id=$1",
    [deletePara]
  );

  res.redirect("/notes")
})

app.post("/updatePara", async(req, res) => {
  const item = req.body.updatedItemTitle;
  const id = req.body.updatedItemId;

  try{
  await db.query("UPDATE notes SET notes = $1 WHERE note_id = $2", [item, id]);
    res.redirect("/notes")
  }catch (err){
   console.log(err);
  }
})

app.post("/register", async (req, res) => {
  const email = req.body.username;
  const password = req.body.password;

  try {
    const checkResult = await db.query("SELECT * FROM users WHERE email = $1", [
      email,
    ]);

    if (checkResult.rows.length > 0) {
      res.send("Email already exists. Try logging in.");
    } else {
      //hashing the password and saving it in the database
      bcrypt.hash(password, saltRounds, async (err, hash) => {
        if (err) {
          console.error("Error hashing password:", err);
        } else {
          console.log("Hashed Password:", hash);
          const result = await db.query(
            "INSERT INTO users (email, password) VALUES ($1, $2) RETURNING *",
            [email, hash]
          );
          const user = result.rows[0];
          req.login(user,(err) => {
            console.log(err);
            res.redirect("/index");
          })
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
    const result = await db.query("SELECT * FROM users WHERE email = $1", [
      username,
    ]);
    if (result.rows.length > 0) {
      const user = result.rows[0];
      const storedHashedPassword = user.password;
      //verifying the password
      bcrypt.compare(password, storedHashedPassword, (err, result) => {
        if (err) {
          return cb (err)
        } else {
          if (result) {
            return cb (null, user);
          } else {
            return cb (null, false)
          }
        }
      });
    } else {
      return cb ("User not found");
    }
  } catch (err) {
    return cb (err)
  }
})
);

passport.use("google", new GoogleStrategy({
 clientID: process.env.GOOGLE_CLIENT_ID,
 clientSecret:process.env.GOOGLE_CLIENT_SECRET,
 callbackURL: "http://localhost:3000/auth/google/index",
 userProfileURL: "https://www.googleapis.com/oauth2/v3/userinfo",
}, async (accessToken, refreshToken, profile, cb) => {
  try {
    console.log(profile);
      const result = await db.query("SELECT * FROM users WHERE email = $1", [
        profile.email,
      ]);
      if (result.rows.length === 0) {
        const newUser = await db.query(
          "INSERT INTO users (email, password) VALUES ($1, $2)",
          [profile.email, "google"]
        );
        return cb(null, newUser.rows[0]);
      } else {
        //Already existing user
        return cb(null, result.rows[0]);
      }
    } catch (err) {
      return cb(err);
    }
})
);

passport.serializeUser((user, cb) => {
  cb(null, user);
});

passport.deserializeUser((user, cb) => {
  cb(null, user);
});

app.listen(port, () => {
  console.log(`Server running from port ${port}`);
});
