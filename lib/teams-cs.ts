/**
 * Czech names for all 48 WC 2026 teams, keyed by the exact English `name`
 * returned by football-data.org's /v4/competitions/WC/teams endpoint.
 *
 * Update when the API changes a team's English spelling (e.g. "Türkiye"
 * was once "Turkey"). The seed script will throw if it encounters a team
 * not in this map.
 */
export const TEAMS_CS: Record<string, string> = {
  // Group A
  Mexico: "Mexiko",
  "South Africa": "Jihoafrická republika",
  "Korea Republic": "Jižní Korea",
  "South Korea": "Jižní Korea",
  Czechia: "Česko",

  // Group B
  Canada: "Kanada",
  "Bosnia-Herzegovina": "Bosna a Hercegovina",
  "Bosnia and Herzegovina": "Bosna a Hercegovina",
  Qatar: "Katar",
  Switzerland: "Švýcarsko",

  // Group C
  Brazil: "Brazílie",
  Morocco: "Maroko",
  Haiti: "Haiti",
  Scotland: "Skotsko",

  // Group D
  "United States": "Spojené státy",
  USA: "Spojené státy",
  Paraguay: "Paraguay",
  Australia: "Austrálie",
  Türkiye: "Turecko",
  Turkey: "Turecko",

  // Group E
  Germany: "Německo",
  "Curaçao": "Curaçao",
  Curacao: "Curaçao",
  "Ivory Coast": "Pobřeží slonoviny",
  "Côte d'Ivoire": "Pobřeží slonoviny",
  Ecuador: "Ekvádor",

  // Group F
  Netherlands: "Nizozemsko",
  Japan: "Japonsko",
  Sweden: "Švédsko",
  Tunisia: "Tunisko",

  // Group G
  Belgium: "Belgie",
  Egypt: "Egypt",
  Iran: "Írán",
  "New Zealand": "Nový Zéland",

  // Group H
  Spain: "Španělsko",
  "Cape Verde": "Kapverdy",
  "Cabo Verde": "Kapverdy",
  "Saudi Arabia": "Saúdská Arábie",
  Uruguay: "Uruguay",

  // Group I
  France: "Francie",
  Senegal: "Senegal",
  Iraq: "Irák",
  Norway: "Norsko",

  // Group J
  Argentina: "Argentina",
  Algeria: "Alžírsko",
  Austria: "Rakousko",
  Jordan: "Jordánsko",

  // Group K
  Portugal: "Portugalsko",
  "Congo DR": "Demokratická republika Kongo",
  "DR Congo": "Demokratická republika Kongo",
  "Democratic Republic of Congo": "Demokratická republika Kongo",
  Uzbekistan: "Uzbekistán",
  Colombia: "Kolumbie",

  // Group L
  England: "Anglie",
  Croatia: "Chorvatsko",
  Ghana: "Ghana",
  Panama: "Panama",
};

export function getCzechName(englishName: string): string {
  const cs = TEAMS_CS[englishName];
  if (!cs) {
    throw new Error(
      `Neznámý překlad pro tým "${englishName}". Doplň ho do lib/teams-cs.ts.`,
    );
  }
  return cs;
}
