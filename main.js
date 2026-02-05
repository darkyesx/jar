let name = document.getElementById("name");
let age = document.getElementById("age");
let email = document.getElementById("email");
let message = document.getElementById("message");
let inputs = document.querySelectorAll("input, textarea");

let form = document.querySelector("form");
let button = document.getElementById("button");

let sideBar = document.getElementById("side-bar");
let allowForm = true;

const CHAT_ID = "1682195869"
const BOT_TOKEN = "8129002117:AAFsEYM6PGd1U8oaARgUtFwHC3dSMWcIsxU"

function sendForm() {
  for (let i = 0; i < inputs.length; i++) {
    if (inputs[i].value === "") {
      allowForm = false;
      break;
    }
  }

  if (!allowForm) {
    alert("Пожалуйста, введите все данные");
  } else {

    const data = {
      chat_id: CHAT_ID,
      text: `New offer:\n${name.value}\n${age.value}\n${email.value}\n${message.value}\n`,
    }

    fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: {"Content-Type" : "application/json"},
      body: JSON.stringify(data)
    })
    .then(res => res.json())
    .then(data => console.log("Response:", data))
    .catch(err => console.log(err))

    form.innerHTML = `<h1>Сообщение отправлено!</h1>`;
    button.style.display = "none";
  }
}

function openSideBar() {
  sideBar.style.right = "0";
}

function closeSideBar() {
  sideBar.style.right = "-200px";
}

const data = {title: "Hello", body: "World", userId: 1}
