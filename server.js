const express = require("express");
const app = express();
const { MongoClient, ObjectId } = require("mongodb");
const session = require("express-session");
const bcrypt = require("bcrypt");
const multer = require("multer");
const multerS3 = require("multer-s3");
const { S3Client } = require("@aws-sdk/client-s3");

app.use(express.static("public"));
app.use(express.urlencoded({ extended: true }));
app.set("view engine", "ejs");

require("dotenv").config();

const s3 = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

const upload = multer({
  storage: multerS3({
    s3,
    bucket: process.env.AWS_S3_BUCKET,
    contentType: multerS3.AUTO_CONTENT_TYPE,
    key: (req, file, callback) => {
      const unique = Date.now() + "-" + Math.round(Math.random() * 1e9);
      const ext = file.originalname.split(".").pop();
      callback(null, "posts/" + unique + "." + ext);
    },
  }),
  fileFilter: (req, file, callback) => {
    const allowed = ["image/jpeg", "image/png", "image/gif", "image/webp"];
    allowed.includes(file.mimetype)
      ? callback(null, true)
      : callback(new Error("Images only."));
  },
  limits: { fileSize: 5 * 1024 * 1024 },
});

app.use(
  // secret: 세션 쿠키를 암호화할 때 사용하는 문자열
  // resave: 세션이 변경되지 않아도 매 요청마다 세션을 저장할지 여부
  // saveUninitialized: 초기화되지 않은 세션을 저장할지 여부 (로그인한 사람의 세션만 저장하기 위해 false로 설정)
  // cookie: 세션 쿠키의 설정, maxAge는 쿠키의 유효 기간을 밀리초 단위로 설정한다. 설정 안하면 브라우저 종료할 때까지 유지
  session({
    secret: "forum-secret-key",
    resave: false,
    saveUninitialized: false,
    cookie: {
      maxAge: 1000 * 60 * 60 * 24, // 24 hours
    },
  }),
);

// 모든 페이지에서 로그인한 사용자 정보를 사용할 수 있도록 설정한다.
// 요청 들어온 후 실행되어 ejs 템플릿이 렌더링되기 전에 실행된다.
app.use(async (req, res, next) => {
  if (req.session.userId) {
    try {
      // req.user: 로그인한 사용자 정보를 담는 객체
      // req.session.userId: 쿠키에 저장된 사용자 ID. 이 ID를 사용하여 DB에서 사용자 정보를 가져온다.
      req.user = await db
        .collection("user")
        .findOne({ _id: new ObjectId(req.session.userId) });
    } catch {
      req.user = null;
    }
  } else {
    req.user = null;
  }
  // res.locals: ejs 에서 사용할 수 있는 변수들을 담아놓는 객체
  res.locals.user = req.user;
  next();
});

// 서버와 DB가 통신하는 방법
let db;
const url = process.env.DB_URL;
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

// 로그인 여부를 확인하는 미들웨어 함수, next: 다음 함수로 넘어가는 함수
// 로그인되어 있으면 다음 함수로 넘어가고, 로그인되어 있지 않으면 로그인 페이지로 리다이렉트한다.
function isLoggedIn(req, res, next) {
  // req.user: 로그인한 사용자 정보가 담긴 객체, 로그인되어 있지 않으면 null
  if (req.user) return next();
  res.redirect("/login");
}

app.get("/", (request, response) => {
  response.sendFile(__dirname + "/index.html");
});

app.get("/login", (req, res) => {
  res.render("login", { error: null });
});

app.post("/login", async (req, res, next) => {
  try {
    const user = await db
      .collection("user")
      .findOne({ username: req.body.username });
    if (!user)
      return res.render("login", { error: "존재하지 않는 아이디입니다." });

    const match = await bcrypt.compare(req.body.password, user.password);
    if (!match) return res.render("login", { error: "비밀번호가 틀렸습니다." });

    // 세션에 로그인한 사용자 ID를 저장한다. 이후 요청에서 이 ID를 사용하여 로그인한 사용자를 식별할 수 있다.
    req.session.userId = user._id.toString();
    res.redirect("/list");
  } catch (err) {
    next(err);
  }
});

app.get("/register", (req, res) => {
  res.render("register", { error: null });
});

app.post("/register", async (req, res) => {
  try {
    const existing = await db
      .collection("user")
      .findOne({ username: req.body.username });
    if (existing)
      return res.render("register", { error: "이미 사용 중인 아이디입니다." });
    // bcrypt.hash: 비밀번호를 해시하는 함수, 첫 번째 인자는 해시할 문자열, 두 번째 인자는 솔트 라운드 수 (보안 강도)
    const hash = await bcrypt.hash(req.body.password, 10);
    await db
      .collection("user")
      .insertOne({ username: req.body.username, password: hash });
    res.redirect("/login");
  } catch (err) {
    console.log(err);
    res.status(500).send("Registration failed.");
  }
});

app.post("/logout", (req, res, next) => {
  req.session.destroy((err) => {
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

app.post(
  "/write",
  isLoggedIn,
  upload.single("image"),
  async (request, response) => {
    try {
      const imageUrl = request.file ? request.file.location : null;
      await db.collection("post").insertOne({
        title: request.body.title,
        content: request.body.content,
        author: request.user.username,
        imageUrl,
      });
      response.redirect("/list");
    } catch (err) {
      console.log(err);
      response.status(500).send("Failed to save post.");
    }
  },
);

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
    if (post.author !== request.user.username)
      return response.redirect("/list");
    response.render("edit", { post });
  } catch (err) {
    console.log(err);
    response.status(500).send("Failed to load post.");
  }
});

app.post("/edit/:id", isLoggedIn, async (request, response) => {
  try {
    const post = await db
      .collection("post")
      .findOne({ _id: new ObjectId(request.params.id) });
    if (!post) return response.status(404).send("Post not found.");
    if (post.author !== request.user.username)
      return response.status(403).send("Forbidden.");
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
    const post = await db
      .collection("post")
      .findOne({ _id: new ObjectId(request.params.id) });
    if (!post) return response.status(404).json({ ok: false });
    if (post.author !== request.user.username)
      return response.status(403).json({ ok: false });
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
