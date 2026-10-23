// The active-search demo's fake server and request log, as htmx.org's demo page shows them (its sinon server, the page's
// own data store and templates, and demo.js's activity entries).
export interface Contact {
  readonly FirstName: string;
  readonly LastName: string;
  readonly Email: string;
  readonly City: string;
}

export interface Entry {
  readonly id: string;
  readonly label: string;
  readonly method: string;
  readonly url: string;
  readonly params: string;
  readonly headers: string;
  readonly code: string;
}

const DATA: readonly Contact[] = [
  { FirstName: "Venus", LastName: "Grimes", Email: "lectus.rutrum@Duisa.edu", City: "Ankara" },
  { FirstName: "Fletcher", LastName: "Owen", Email: "metus@Aenean.org", City: "Niort" },
  { FirstName: "William", LastName: "Hale", Email: "eu.dolor@risusodio.edu", City: "Te Awamutu" },
  { FirstName: "TaShya", LastName: "Cash", Email: "tincidunt.orci.quis@nuncnullavulputate.co.uk", City: "Titagarh" },
  { FirstName: "Kevyn", LastName: "Hoover", Email: "tristique.pellentesque.tellus@Cumsociis.co.uk", City: "Cuenca" },
  { FirstName: "Jakeem", LastName: "Walker", Email: "Morbi.vehicula.Pellentesque@faucibusorci.org", City: "St. Andrä" },
  { FirstName: "Malcolm", LastName: "Trujillo", Email: "sagittis@velit.edu", City: "Fort Resolution" },
  { FirstName: "Wynne", LastName: "Rice", Email: "augue.id@felisorciadipiscing.edu", City: "Kinross" },
  { FirstName: "Evangeline", LastName: "Klein", Email: "adipiscing.lobortis@sem.org", City: "San Giovanni in Galdo" },
  { FirstName: "Jennifer", LastName: "Russell", Email: "sapien.Aenean.massa@risus.com", City: "Laives/Leifers" },
  { FirstName: "Rama", LastName: "Freeman", Email: "Proin@quamPellentesquehabitant.net", City: "Flin Flon" },
  { FirstName: "Jena", LastName: "Mathis", Email: "non.cursus.non@Phaselluselit.com", City: "Fort Simpson" },
  { FirstName: "Alexandra", LastName: "Maynard", Email: "porta.elit.a@anequeNullam.ca", City: "Nazilli" },
  { FirstName: "Tallulah", LastName: "Haley", Email: "ligula@id.net", City: "Bay Roberts" },
  { FirstName: "Timon", LastName: "Small", Email: "velit.Quisque.varius@gravidaPraesent.org", City: "Girona" },
  { FirstName: "Randall", LastName: "Pena", Email: "facilisis@Donecconsectetuer.edu", City: "Edam" },
  { FirstName: "Conan", LastName: "Vaughan", Email: "luctus.sit@Classaptenttaciti.edu", City: "Nadiad" },
  { FirstName: "Dora", LastName: "Allen", Email: "est.arcu.ac@Vestibulumante.co.uk", City: "Renfrew" },
  { FirstName: "Aiko", LastName: "Little", Email: "quam.dignissim@convallisest.net", City: "Delitzsch" },
  { FirstName: "Jessamine", LastName: "Bauer", Email: "taciti.sociosqu@nibhvulputatemauris.co.uk", City: "Offida" },
  { FirstName: "Gillian", LastName: "Livingston", Email: "justo@atiaculisquis.com", City: "Saskatoon" },
  { FirstName: "Laith", LastName: "Nicholson", Email: "elit.pellentesque.a@diam.org", City: "Tallahassee" },
  { FirstName: "Paloma", LastName: "Alston", Email: "cursus@metus.org", City: "Cache Creek" },
  { FirstName: "Freya", LastName: "Dunn", Email: "Vestibulum.accumsan@metus.co.uk", City: "Heist-aan-Zee" },
  { FirstName: "Griffin", LastName: "Rice", Email: "justo@tortordictumeu.net", City: "Montpelier" },
  { FirstName: "Catherine", LastName: "West", Email: "malesuada.augue@elementum.com", City: "Tarnów" },
  { FirstName: "Jena", LastName: "Chambers", Email: "erat.Etiam.vestibulum@quamelementumat.net", City: "Konya" },
  { FirstName: "Neil", LastName: "Rodriguez", Email: "enim@facilisis.com", City: "Kraków" },
  { FirstName: "Freya", LastName: "Charles", Email: "metus@nec.net", City: "Arzano" },
  { FirstName: "Anastasia", LastName: "Strong", Email: "sit@vitae.edu", City: "Polpenazze del Garda" },
  { FirstName: "Bell", LastName: "Simon", Email: "mollis.nec.cursus@disparturientmontes.ca", City: "Caxias do Sul" },
  { FirstName: "Minerva", LastName: "Allison", Email: "Donec@nequeIn.edu", City: "Rio de Janeiro" },
  { FirstName: "Yoko", LastName: "Dawson", Email: "neque.sed@semper.net", City: "Saint-Remy-Geest" },
  { FirstName: "Nadine", LastName: "Justice", Email: "netus@et.edu", City: "Calgary" },
  { FirstName: "Hoyt", LastName: "Rosa", Email: "Nullam.ut.nisi@Aliquam.co.uk", City: "Mold" },
  { FirstName: "Shafira", LastName: "Noel", Email: "tincidunt.nunc@non.edu", City: "Kitzbühel" },
  { FirstName: "Jin", LastName: "Nunez", Email: "porttitor.tellus.non@venenatisamagna.net", City: "Dreieich" },
  { FirstName: "Barbara", LastName: "Gay", Email: "est.congue.a@elit.com", City: "Overland Park" },
  { FirstName: "Riley", LastName: "Hammond", Email: "tempor.diam@sodalesnisi.net", City: "Smoky Lake" },
  { FirstName: "Molly", LastName: "Fulton", Email: "semper@Naminterdumenim.net", City: "Montese" },
  { FirstName: "Dexter", LastName: "Owen", Email: "non.ante@odiosagittissemper.ca", City: "Bousval" },
  { FirstName: "Kuame", LastName: "Merritt", Email: "ornare.placerat.orci@nisinibh.ca", City: "Solingen" },
  { FirstName: "Maggie", LastName: "Delgado", Email: "Nam.ligula.elit@Cum.org", City: "Tredegar" },
  { FirstName: "Hanae", LastName: "Washington", Email: "nec.euismod@adipiscingelit.org", City: "Amersfoort" },
  { FirstName: "Jonah", LastName: "Cherry", Email: "ridiculus.mus.Proin@quispede.edu", City: "Acciano" },
  { FirstName: "Cheyenne", LastName: "Munoz", Email: "at@molestiesodalesMauris.edu", City: "Saint-L?onard" },
  { FirstName: "India", LastName: "Mack", Email: "sem.mollis@Inmi.co.uk", City: "Maryborough" },
  { FirstName: "Lael", LastName: "Mcneil", Email: "porttitor@risusDonecegestas.com", City: "Livorno" },
  { FirstName: "Jillian", LastName: "Mckay", Email: "vulputate.eu.odio@amagnaLorem.co.uk", City: "Salvador" },
  { FirstName: "Shaine", LastName: "Wright", Email: "malesuada@pharetraQuisqueac.org", City: "Newton Abbot" },
  { FirstName: "Keane", LastName: "Richmond", Email: "nostra.per.inceptos@euismodurna.org", City: "Canterano" },
  { FirstName: "Samuel", LastName: "Davis", Email: "felis@euenim.com", City: "Peterhead" },
  { FirstName: "Zelenia", LastName: "Sheppard", Email: "Quisque.nonummy@antelectusconvallis.org", City: "Motta Visconti" },
  { FirstName: "Giacomo", LastName: "Cole", Email: "aliquet.libero@urnaUttincidunt.ca", City: "Donnas" },
  { FirstName: "Mason", LastName: "Hinton", Email: "est@Nunc.co.uk", City: "St. Asaph" },
  { FirstName: "Katelyn", LastName: "Koch", Email: "velit.Aliquam@Suspendisse.edu", City: "Cleveland" },
  { FirstName: "Olga", LastName: "Spencer", Email: "faucibus@Praesenteudui.net", City: "Karapınar" },
  { FirstName: "Erasmus", LastName: "Strong", Email: "dignissim.lacus@euarcu.net", City: "Passau" },
  { FirstName: "Regan", LastName: "Cline", Email: "vitae.erat.vel@lacusEtiambibendum.co.uk", City: "Pergola" },
  { FirstName: "Stone", LastName: "Holt", Email: "eget.mollis.lectus@Aeneanegestas.ca", City: "Houston" },
  { FirstName: "Deanna", LastName: "Branch", Email: "turpis@estMauris.net", City: "Olcenengo" },
  { FirstName: "Rana", LastName: "Green", Email: "metus@conguea.edu", City: "Onze-Lieve-Vrouw-Lombeek" },
  { FirstName: "Caryn", LastName: "Henson", Email: "Donec.sollicitudin.adipiscing@sed.net", City: "Kington" },
  { FirstName: "Clarke", LastName: "Stein", Email: "nec@mollis.co.uk", City: "Tenali" },
  { FirstName: "Kelsie", LastName: "Porter", Email: "Cum@gravidaAliquam.com", City: "İskenderun" },
  { FirstName: "Cooper", LastName: "Pugh", Email: "Quisque.ornare.tortor@dictum.co.uk", City: "Delhi" },
  { FirstName: "Paul", LastName: "Spencer", Email: "ac@InfaucibusMorbi.com", City: "Biez" },
  { FirstName: "Cassady", LastName: "Farrell", Email: "Suspendisse.non@venenatisa.net", City: "New Maryland" },
  { FirstName: "Sydnee", LastName: "Velazquez", Email: "mollis@loremfringillaornare.com", City: "Strée" },
  { FirstName: "Felix", LastName: "Boyle", Email: "id.libero.Donec@aauctor.org", City: "Edinburgh" },
  { FirstName: "Ryder", LastName: "House", Email: "molestie@natoquepenatibus.org", City: "Copertino" },
  { FirstName: "Hadley", LastName: "Holcomb", Email: "penatibus@nisi.ca", City: "Avadi" },
  { FirstName: "Marsden", LastName: "Nunez", Email: "Nulla.eget.metus@facilisisvitaeorci.org", City: "New Galloway" },
  { FirstName: "Alana", LastName: "Powell", Email: "non.lobortis.quis@interdumfeugiatSed.net", City: "Pitt Meadows" },
  { FirstName: "Dennis", LastName: "Wyatt", Email: "Morbi.non@nibhQuisquenonummy.ca", City: "Wrexham" },
  { FirstName: "Karleigh", LastName: "Walton", Email: "nascetur.ridiculus@quamdignissimpharetra.com", City: "Diksmuide" },
  { FirstName: "Brielle", LastName: "Donovan", Email: "placerat@at.edu", City: "Kolmont" },
  { FirstName: "Donna", LastName: "Dickerson", Email: "lacus.pede.sagittis@lacusvestibulum.com", City: "Vallepietra" },
  { FirstName: "Eagan", LastName: "Pate", Email: "est.Nunc@cursusNunc.ca", City: "Durness" },
  { FirstName: "Carlos", LastName: "Ramsey", Email: "est.ac.facilisis@duinec.co.uk", City: "Tiruvottiyur" },
  { FirstName: "Regan", LastName: "Murphy", Email: "lectus.Cum@aptent.com", City: "Candidoni" },
  { FirstName: "Claudia", LastName: "Spence", Email: "Nunc.lectus.pede@aceleifend.co.uk", City: "Augusta" },
  { FirstName: "Genevieve", LastName: "Parker", Email: "ultrices@inaliquetlobortis.net", City: "Forbach" },
  { FirstName: "Marshall", LastName: "Allison", Email: "erat.semper.rutrum@odio.org", City: "Landau" },
  { FirstName: "Reuben", LastName: "Davis", Email: "Donec@auctorodio.edu", City: "Schönebeck" },
  { FirstName: "Ralph", LastName: "Doyle", Email: "pede.Suspendisse.dui@Curabitur.org", City: "Linkebeek" },
  { FirstName: "Constance", LastName: "Gilliam", Email: "mollis@Nulla.edu", City: "Enterprise" },
  { FirstName: "Serina", LastName: "Jacobson", Email: "dictum.augue@ipsum.net", City: "Hérouville-Saint-Clair" },
  { FirstName: "Charity", LastName: "Byrd", Email: "convallis.ante.lectus@scelerisquemollisPhasellus.co.uk", City: "Brussegem" },
  { FirstName: "Hyatt", LastName: "Bird", Email: "enim.Nunc.ut@nonmagnaNam.com", City: "Gdynia" },
  { FirstName: "Brent", LastName: "Dunn", Email: "ac.sem@nuncid.com", City: "Hay-on-Wye" },
  { FirstName: "Casey", LastName: "Bonner", Email: "id@ornareelitelit.edu", City: "Kearny" },
  { FirstName: "Hakeem", LastName: "Gill", Email: "dis@nonummyipsumnon.org", City: "Portico e San Benedetto" },
  { FirstName: "Stewart", LastName: "Meadows", Email: "Nunc.pulvinar.arcu@convallisdolorQuisque.net", City: "Dignano" },
  { FirstName: "Nomlanga", LastName: "Wooten", Email: "inceptos@turpisegestas.ca", City: "Troon" },
  { FirstName: "Sebastian", LastName: "Watts", Email: "Sed.diam.lorem@lorem.co.uk", City: "Palermo" },
  { FirstName: "Chelsea", LastName: "Larsen", Email: "ligula@Nam.net", City: "Poole" },
  { FirstName: "Cameron", LastName: "Humphrey", Email: "placerat@id.org", City: "Manfredonia" },
  { FirstName: "Juliet", LastName: "Bush", Email: "consectetuer.euismod@vitaeeratVivamus.co.uk", City: "Lavacherie" },
  { FirstName: "Caryn", LastName: "Hooper", Email: "eu.enim.Etiam@ridiculus.org", City: "Amelia" },
];

// demo.js's parseParams HTML-encodes every value it decodes, so the data store searches for the encoded text.
const encodeParam = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");

// The page's dataStore.findContactsMatching.
export function contactsMatching(search: string): Contact[] {
  const s = encodeParam(search).toLowerCase();
  return DATA.filter(
    (c) => c.FirstName.toLowerCase().includes(s) || c.LastName.toLowerCase().includes(s) || c.Email.toLowerCase().includes(s),
  );
}

// The page's searchUI(), which init("/init") wrote into #demo-canvas.
const SEARCH_UI = `  <h3>
Search Contacts
<span class="htmx-indicator">
<img src="/img/bars.svg" alt=""/> Searching...
</span>
</h3>

<input class="form-control" type="search"
       name="search" placeholder="Begin Typing To Search Users..."
       hx-post="/search"
       hx-trigger="input changed delay:500ms, keyup[key=='Enter'], load"
       hx-target="#search-results"
       hx-indicator=".htmx-indicator">

<table class="table">
<thead>
<tr>
  <th>First Name</th>
  <th>Last Name</th>
  <th>Email</th>
</tr>
</thead>
<tbody id="search-results">
</tbody>
</table>`;

// The page's resultsUI(contacts).
function resultsUI(contacts: readonly Contact[]): string {
  let txt = "";
  for (const c of contacts) txt += `<tr><td>${c.FirstName}</td><td>${c.LastName}</td><td>${c.Email}</td></tr>\n`;
  return txt;
}

const escapeHtml = (text: string) =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\u00a0/g, "&nbsp;");
const ENTITIES: Record<string, string> = { lt: "<", gt: ">", amp: "&", quot: '"', nbsp: "\u00a0" };
// What the browser makes of escaped text cut short: whole entities, and lt, gt and amp without their semicolon at the cut.
const decodeHtml = (html: string) =>
  html.replace(/&(lt|gt|amp|quot|nbsp)(;|$)/g, (whole, name: string, end: string) =>
    end || name !== "quot" ? ENTITIES[name]! : whole,
  );

// demo.js keeps the first 750 characters of an entry's HTML and adds "..."; returns the code the entry then shows.
function shownCode(before: string, code: string, after: string): string {
  const escaped = escapeHtml(code);
  if (before.length + escaped.length + after.length <= 750) return code;
  return `${decodeHtml(escaped.slice(0, Math.max(0, 750 - before.length)))}...`;
}

export const INITIAL_CODE = shownCode(
  `<span class="activity initial">
  <b>HTML</b>
  <pre class="language-html"><code class="language-html">`,
  SEARCH_UI,
  "</code></pre>\n</span>",
);

// The POST /search the input sends (on load, after typing and on Enter) and the entry demo.js logs for it.
export function searchEntry(n: number, search: string): { readonly contacts: Contact[]; readonly entry: Entry } {
  const contacts = contactsMatching(search);
  const json = JSON.stringify({ search: encodeParam(search) });
  const url = "/search";
  const before = `<span class="activity response">
  <div>
  <b>POST</b> ${url}
  </div>
  <div>
    parameters: ${json}
  </div>
  <div>
    headers: {}
  </div>
  <div>
  <b>Response</b>
  <pre class="language-html"><code class="language-html">`;
  return {
    contacts,
    entry: {
      id: `req-${n}`,
      label: `POST ${url}`,
      method: "POST",
      url,
      params: decodeHtml(json),
      headers: "{}",
      code: shownCode(before, resultsUI(contacts), "</code> </pre>\n  </div>\n</span>"),
    },
  };
}

// What the page shows once the load trigger's request has been answered.
export const LOADED = searchEntry(1, "");

// Where an answered search goes: the page's state.
export interface SearchPage {
  value(): string;
  logged(): number;
  busy(on: boolean): void;
  answer(contacts: Contact[], entry: Entry): void;
}

// htmx sends one request at a time per element; one asked for meanwhile waits and runs, with the input's value then,
// once the fake server (which answers after 80 ms) has answered.
let inFlight = false;
let waiting: SearchPage | undefined;
export function postSearch(page: SearchPage): void {
  if (inFlight) {
    waiting = page;
    return;
  }
  inFlight = true;
  page.busy(true);
  setTimeout(() => {
    const { contacts, entry } = searchEntry(page.logged() + 1, page.value());
    page.answer(contacts, entry);
    page.busy(false);
    inFlight = false;
    const next = waiting;
    waiting = undefined;
    if (next) postSearch(next);
  }, 80);
}

// The delay:500ms modifier: each new trigger starts the wait again.
let typing: ReturnType<typeof setTimeout> | undefined;
export function afterTyping(send: () => void): void {
  clearTimeout(typing);
  typing = setTimeout(send, 500);
}
