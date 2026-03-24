const express = require("express");
const app = express();
const { MongoClient, ObjectId } = require("mongodb");
const session = require("express-session");
const passport = require("passport");
const LocalStrategy = require("passport-local");
const bcrypt = require("bcrypt");

app.use(express.static("public"));
app.use(express.urlencoded({ extended: true }));
app.set("view engine", "ejs");

app.use(session({
  secret: "forum-secret-key",
  resave: false,
  saveUninitialized: false,
}));
app.use(passport.initialize());
app.use(passport.session());

passport.use(new LocalStrategy(async (username, password, done) => {
  try {
    const user = await db.collection("user").findOne({ username });
    if (!user) return done(null, false, { message: "존재하지 않는 아이디입니다." });
    const match = await bcrypt.compare(password, user.password);
    if (!match) return done(null, false, { message: "비밀번호가 틀렸습니다." });
    return done(null, user);
  } catch (err) {
    return done(err);
  }
}));

passport.serializeUser((user, done) => done(null, user._id.toString()));
passport.deserializeUser(async (id, done) => {
  try {
    const user = await db.collection("user").findOne({ _id: new ObjectId(id) });
    done(null, user);
  } catch (err) {
    done(err);
  }
});

// 서버와 DB가 통신하는 방법
let db;
const url =
  "mongodb+srv://sbh2025dev_db_user:ZJgWipSJIgDw42MM@cluster0.v4ics3u.mongodb.net/?appName=Cluster0";
new MongoClient(url)
  .connect()
  .then((client) => {
    console.log("DB 연결성공");
    db = client.db("forum");

    app.listen(3000, () => {
      console.log("http://localhost:3000 에서 서버 실행중");
    });
  })
  .catch((err) => {
    console.log(err);
  });

function isLoggedIn(req, res, next) {
  if (req.isAuthenticated()) return next();
  res.redirect("/login");
}

// 누군가가 메인페이지를 요청했을 때 "hello world" 라는 문자열로 응답해준다.
app.get("/", (request, response) => {
  response.sendFile(__dirname + "/index.html");
});

app.get("/login", (req, res) => {
  res.render("login", { error: null });
});

app.post("/login", (req, res, next) => {
  passport.authenticate("local", (err, user, info) => {
    if (err) return next(err);
    if (!user) return res.render("login", { error: info.message });
    req.logIn(user, (err) => {
      if (err) return next(err);
      res.redirect("/list");
    });
  })(req, res, next);
});

app.get("/register", (req, res) => {
  res.render("register", { error: null });
});

app.post("/register", async (req, res) => {
  try {
    const existing = await db.collection("user").findOne({ username: req.body.username });
    if (existing) return res.render("register", { error: "이미 사용 중인 아이디입니다." });
    const hash = await bcrypt.hash(req.body.password, 10);
    await db.collection("user").insertOne({ username: req.body.username, password: hash });
    res.redirect("/login");
  } catch (err) {
    console.log(err);
    res.status(500).send("Registration failed.");
  }
});

app.post("/logout", (req, res, next) => {
  req.logout((err) => {
    if (err) return next(err);
    res.redirect("/login");
  });
});

app.get("/shop", (request, response) => {
  // db.collection("post").insertOne(
  //   { name: "홍길동", age: 20, _id: 100 },
  //   (err, result) => {
  //     if (err) {
  //       console.log(err);
  //     }
  //   },
  // );
  response.sendFile(__dirname + "/shop.html");

  // for (let i = 0; i < 3; i++) {
  //   console.log(i);
  // }
});

app.get("/write", isLoggedIn, (request, response) => {
  response.render("write");
});

app.post("/write", isLoggedIn, async (request, response) => {
  try {
    await db.collection("post").insertOne({
      title: request.body.title,
      content: request.body.content,
    });
    response.redirect("/list");
  } catch (err) {
    console.log(err);
    response.status(500).send("Failed to save post.");
  }
});

app.get("/detail/:id", async (request, response) => {
  try {
    const post = await db
      .collection("post")
      .findOne({ _id: new ObjectId(request.params.id) });
    if (!post) return response.status(404).send("Post not found.");
    response.render("detail", { post });
  } catch (err) {
    console.log(err);
    response.status(500).send("Failed to load post.");
  }
});

app.get("/edit/:id", isLoggedIn, async (request, response) => {
  try {
    const post = await db
      .collection("post")
      .findOne({ _id: new ObjectId(request.params.id) });
    if (!post) return response.status(404).send("Post not found.");
    response.render("edit", { post });
  } catch (err) {
    console.log(err);
    response.status(500).send("Failed to load post.");
  }
});

app.post("/edit/:id", isLoggedIn, async (request, response) => {
  try {
    await db
      .collection("post")
      .updateOne(
        { _id: new ObjectId(request.params.id) },
        { $set: { title: request.body.title, content: request.body.content } },
      );
    response.redirect("/list");
  } catch (err) {
    console.log(err);
    response.status(500).send("Failed to update post.");
  }
});

app.delete("/post/:id", isLoggedIn, async (request, response) => {
  try {
    await db
      .collection("post")
      .deleteOne({ _id: new ObjectId(request.params.id) });
    response.json({ ok: true });
  } catch (err) {
    console.log(err);
    response.status(500).json({ ok: false });
  }
});

app.get("/list", async (request, response) => {
  // await: 다음 줄을 처리하기 전에 기다린다. DB에서 데이터를 가져오는 작업이 끝날 때까지 기다린다.
  let db_result = await db
    .collection("post")
    .find()
    .toArray((err, result) => {
      if (err) {
        console.log(err);
      }
    });
  // db_result는 array 형태로 DB에서 가져온 데이터를 담고 있다.
  // console.log(db_result[0].title);
  response.render("list", { posts: db_result });
});
