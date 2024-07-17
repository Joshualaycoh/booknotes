import express from "express";
import bodyParser from "body-parser";

const app = express();
const port = 3000;
app.use(express.static("public"));
app.use(bodyParser.urlencoded({ extended: true }));

app.get("/", (req, res) => {
  res.render("index.ejs");
});

app.post("/notes", (req, res) => {
    if (req.body.book === "enter" ) {
    res.render("notes.ejs");
    } else {
     res.redirect("/");   
    }
})

app.listen(port, () => {
  console.log(`Server running from port ${port}`);
});
