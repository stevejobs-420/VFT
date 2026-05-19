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
  "United States": "USA",
  USA: "USA",
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
  "Cape Verde Islands": "Kapverdy",
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
  "Congo DR": "DR Kongo",
  "DR Congo": "DR Kongo",
  "Democratic Republic of Congo": "DR Kongo",
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

/**
 * Flag emoji per Czech team name. Used in the champion banner and anywhere
 * else we want a quick visual cue without loading the SVG crest.
 */
export const FLAG_EMOJI: Record<string, string> = {
  // Group A
  Mexiko: "🇲🇽",
  "Jihoafrická republika": "🇿🇦",
  "Jižní Korea": "🇰🇷",
  "Česko": "🇨🇿",
  // Group B
  Kanada: "🇨🇦",
  "Bosna a Hercegovina": "🇧🇦",
  Katar: "🇶🇦",
  "Švýcarsko": "🇨🇭",
  // Group C
  "Brazílie": "🇧🇷",
  Maroko: "🇲🇦",
  Haiti: "🇭🇹",
  Skotsko: "🏴󠁧󠁢󠁳󠁣󠁴󠁿",
  // Group D
  USA: "🇺🇸",
  Paraguay: "🇵🇾",
  Austrálie: "🇦🇺",
  Turecko: "🇹🇷",
  // Group E
  "Německo": "🇩🇪",
  "Curaçao": "🇨🇼",
  "Pobřeží slonoviny": "🇨🇮",
  "Ekvádor": "🇪🇨",
  // Group F
  Nizozemsko: "🇳🇱",
  Japonsko: "🇯🇵",
  "Švédsko": "🇸🇪",
  Tunisko: "🇹🇳",
  // Group G
  Belgie: "🇧🇪",
  Egypt: "🇪🇬",
  "Írán": "🇮🇷",
  "Nový Zéland": "🇳🇿",
  // Group H
  "Španělsko": "🇪🇸",
  Kapverdy: "🇨🇻",
  "Saúdská Arábie": "🇸🇦",
  Uruguay: "🇺🇾",
  // Group I
  Francie: "🇫🇷",
  Senegal: "🇸🇳",
  "Irák": "🇮🇶",
  Norsko: "🇳🇴",
  // Group J
  Argentina: "🇦🇷",
  "Alžírsko": "🇩🇿",
  Rakousko: "🇦🇹",
  "Jordánsko": "🇯🇴",
  // Group K
  Portugalsko: "🇵🇹",
  "DR Kongo": "🇨🇩",
  "Uzbekistán": "🇺🇿",
  Kolumbie: "🇨🇴",
  // Group L
  Anglie: "🏴󠁧󠁢󠁥󠁮󠁧󠁿",
  Chorvatsko: "🇭🇷",
  Ghana: "🇬🇭",
  Panama: "🇵🇦",
};

export function getFlagEmoji(czechName: string): string {
  const flag = FLAG_EMOJI[czechName];
  if (!flag) {
    if (typeof console !== "undefined") {
      console.warn(`Chybí vlajka pro tým "${czechName}". Doplň ji do lib/teams-cs.ts.`);
    }
    return "";
  }
  return flag;
}
