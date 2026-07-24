/** ponytail: self-check for resolved/closed open-position filter */
function isMarketInactive(meta) {
  return Boolean(meta.resolved || meta.closed);
}

const cases = [
  [{}, false],
  [{ resolved: false, closed: false }, false],
  [{ resolved: true }, true],
  [{ closed: true }, true],
  [{ resolved: true, closed: true }, true],
  [{ resolved: false, closed: true }, true],
];

for (const [meta, want] of cases) {
  const got = isMarketInactive(meta);
  if (got !== want) {
    console.error("fail", meta, "got", got, "want", want);
    process.exit(1);
  }
}
console.log("ok");
