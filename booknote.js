import express from "express";
import bodyParser from "body-parser";
import pg from "pg";

const app = express();
const port = 3000;

const db = new pg.Client({
  user:"postgres",
  host:"localhost",
  database:"booknotes",
  password:"qwer1234",
  port:5432,
});

db.connect();

app.use(express.static("public"));
app.use(bodyParser.urlencoded({ extended: true }));
let currentBookId = 1;
let titles = [];


async function checkNotes() {
  const result = await db.query(
    "SELECT * FROM notes JOIN title ON title.id=title_id WHERE title_id=$1 ORDER BY note_id",
  [currentBookId]
  );
  const booknote = result.rows;
  return booknote;
}

async function getCurrentBook() {
  const result = await db.query("SELECT * FROM title ORDER BY id");
  titles = result.rows;
  return titles.find((title) => title.id == currentBookId);
}

app.get("/index", async(req, res) => {
 
  const currentBooks = await getCurrentBook();
  res.render("index.ejs",{
    title: titles,
    details: currentBooks,
  });
});

app.get("/notes", async(req, res) => {
  const booknote = await checkNotes();
 
  res.render("notes.ejs",{
   booknote: booknote,
 
  });
})

app.get("/create",(req, res) => {
  res.render("create.ejs")
})

app.get("/about",(req, res) => {
  res.render("about.ejs")
})


app.post("/book", async(req, res) => {;
  const booknotes = req.body.booknotes;
  if (booknotes) {
    currentBookId = req.body.booknotes;
    res.redirect("/notes")
  } else {
    res.redirect("/");
  }
})

app.post("/create", async(req,res) => {
  const title = req.body.title;
  const rating = req.body.rating;
  const overview = req.body.overview;
  const notes = req.body.notes;

  const result = await db.query(
    "INSERT INTO title (book_title, rating, overview) VALUES($1,$2,$3) RETURNING id",
  [title, rating, overview]
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



app.listen(port, () => {
  console.log(`Server running from port ${port}`);
});
