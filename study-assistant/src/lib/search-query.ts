// Zet een vrije vraag om in een veilige Postgres tsquery (OR van woordprefixen).
// Stopwoorden (NL + EN) worden weggelaten zodat ranking op inhoudswoorden gebeurt.

const STOPWORDS = new Set(
  (
    "de het een en of maar dan dat die dit deze er is zijn was waren wordt worden werd heb heeft hebben had " +
    "ik je jij u we wij ze zij hij hem haar mijn jouw onze hun mij me ons wat wie waar wanneer waarom hoe welk welke " +
    "van in op aan met voor naar bij om uit over tot door als ook nog wel niet geen al zo te kan kun kunnen moet moeten " +
    "zou zouden mag mogen wil willen graag even eens leg uit uitleggen vertel beschrijf geef verschil tussen " +
    "the a an and or but if then that this these those is are was were be been being have has had do does did " +
    "i you he she it we they me my your our their what who where when why how which of in on at to for from by " +
    "with about as into than so not no can could should would will shall may might must please explain tell describe"
  ).split(" "),
);

export function buildTsQuery(input: string, maxTerms = 12): string {
  const words = (input.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []).filter(
    (w) => (w.length >= 2 || /\d/.test(w)) && !STOPWORDS.has(w),
  );
  const unique = [...new Set(words)].slice(0, maxTerms);
  return unique.map((w) => `${w}:*`).join(" | ");
}
