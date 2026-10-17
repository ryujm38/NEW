'use strict';
// 게임 종류와 상관없이 쓰는 도우미

const crypto = require('crypto');

const NAME_MAX = 8;

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function newId() {
  return crypto.randomBytes(6).toString('hex');
}

function newToken() {
  return crypto.randomBytes(16).toString('hex');
}

function cleanName(raw) {
  return String(raw ?? '').replace(/\s+/g, ' ').trim().slice(0, NAME_MAX);
}

module.exports = { NAME_MAX, shuffle, newId, newToken, cleanName };
