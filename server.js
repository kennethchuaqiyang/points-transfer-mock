// Mock backend+UI for the "Loyalty Points Transfer" blind-practice
// exercise. In-memory state only; reset by restarting the process or
// POST /debug/reset.

const express = require("express");

const PORT = process.env.PORT || 4300;

const seedAccounts = () => ({
  acct_001: { accountId: "acct_001", ownerName: "Amy", balance: 500 },
  acct_002: { accountId: "acct_002", ownerName: "Ben", balance: 100 },
  acct_003: { accountId: "acct_003", ownerName: "Amy", balance: 0 },
  acct_004: { accountId: "acct_004", ownerName: "Cara", balance: 50 },
});

let ACCOUNTS = seedAccounts();

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// ---------------------------------------------------------------------
// Shared transfer logic, used by both the JSON API and the form-based UI.
// Returns { ok: true, fromBalance, toBalance } or { ok: false, status, error }.
function doTransfer(fromAccountId, toAccountId, rawAmount) {
  const from = ACCOUNTS[fromAccountId];
  if (!from) {
    return { ok: false, status: 404, error: "Account not found" };
  }

  const amount = Number(rawAmount);
  if (rawAmount === undefined || rawAmount === null || rawAmount === "" || !Number.isFinite(amount) || amount <= 0) {
    return { ok: false, status: 400, error: "amount must be a positive number" };
  }

  if (!toAccountId) {
    return { ok: false, status: 400, error: "toAccountId is required" };
  }
  if (toAccountId === fromAccountId) {
    return { ok: false, status: 400, error: "Cannot transfer to the same account" };
  }
  const to = ACCOUNTS[toAccountId];
  if (!to) {
    return { ok: false, status: 404, error: "Destination account not found" };
  }

  if (amount > from.balance) {
    return { ok: false, status: 409, error: "Insufficient balance" };
  }

  from.balance -= amount;
  to.balance += amount;

  return { ok: true, fromBalance: from.balance, toBalance: to.balance };
}

// ---------------------------------------------------------------------
// JSON API

app.post("/api/accounts/:id/points/transfer", (req, res) => {
  const pathId = req.params.id;
  const actorId = req.header("x-account-id");

  if (!actorId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  if (actorId !== pathId) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const { toAccountId, amount } = req.body || {};
  const result = doTransfer(pathId, toAccountId, amount);
  if (!result.ok) {
    res.status(result.status).json({ error: result.error });
    return;
  }
  res.status(200).json({
    fromAccountId: pathId,
    toAccountId,
    fromBalance: result.fromBalance,
    toBalance: result.toBalance,
  });
});

app.get("/api/accounts/:id", (req, res) => {
  const acct = ACCOUNTS[req.params.id];
  if (!acct) {
    res.status(404).json({ error: "Account not found" });
    return;
  }
  res.status(200).json(acct);
});

// ---------------------------------------------------------------------
// UI

function layout(body) {
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Points Transfer</title>
  <style>
    body { font-family: sans-serif; max-width: 640px; margin: 40px auto; color: #222; }
    table { width: 100%; border-collapse: collapse; margin: 16px 0; }
    th, td { text-align: left; padding: 6px; border-bottom: 1px solid #ddd; }
    .error { color: #b00020; }
    .notice { color: #0a7d2c; }
    label { display: block; margin-top: 10px; }
  </style>
</head>
<body>
${body}
</body>
</html>`;
}

app.get("/", (req, res) => {
  const msg = req.query.msg ? `<p class="notice" id="transfer-notice">${req.query.msg}</p>` : "";
  const err = req.query.err ? `<p class="error" id="transfer-error">${req.query.err}</p>` : "";

  const accountOptions = Object.values(ACCOUNTS)
    .map((a) => `<option value="${a.accountId}">${a.accountId} — ${a.ownerName} (${a.balance} pts)</option>`)
    .join("");

  const balanceRows = Object.values(ACCOUNTS)
    .map((a) => `<tr class="account-row" data-account-id="${a.accountId}"><td>${a.accountId}</td><td>${a.ownerName}</td><td class="balance">${a.balance}</td></tr>`)
    .join("");

  res.send(
    layout(
      `<h1>Loyalty Points Transfer</h1>
       ${msg}${err}
       <table id="accounts-table">
         <thead><tr><th>Account</th><th>Owner</th><th>Balance</th></tr></thead>
         <tbody>${balanceRows}</tbody>
       </table>

       <form id="transfer-form" method="post" action="/transfer">
         <label for="fromAccountId">From account (this is you)</label>
         <select id="fromAccountId" name="fromAccountId">${accountOptions}</select>

         <label for="toAccountId">To account</label>
         <select id="toAccountId" name="toAccountId">${accountOptions}</select>

         <label for="amount">Amount</label>
         <input id="amount" name="amount" type="text" />

         <button type="submit" id="transfer-submit">Transfer</button>
       </form>`
    )
  );
});

app.post("/transfer", (req, res) => {
  const { fromAccountId, toAccountId, amount } = req.body || {};
  const result = doTransfer(fromAccountId, toAccountId, amount);
  if (!result.ok) {
    res.redirect(`/?err=${encodeURIComponent(result.error)}`);
    return;
  }
  res.redirect(`/?msg=${encodeURIComponent(`Sent ${amount} pts. New balance: ${result.fromBalance}.`)}`);
});

// ---------------------------------------------------------------------
// Debug

app.get("/debug/accounts", (req, res) => res.json(ACCOUNTS));

app.post("/debug/reset", (req, res) => {
  ACCOUNTS = seedAccounts();
  res.json({ status: "reset" });
});

app.listen(PORT, () => {
  console.log(`points-transfer-mock listening on :${PORT}`);
});
