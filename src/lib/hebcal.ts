/**
 * Hebcal API integration for fetching Shabbat times
 * Location: Nahalim (נחלים), Israel - geonameid=294071
 */

export interface ShabbatTimes {
  date: string;           // תאריך שבת (YYYY-MM-DD)
  candleLighting: Date;   // הדלקת נרות
  havdalah: Date;         // הבדלה
}

export interface GameTimes {
  wave1Opens: Date;       // יום שישי 12:00
  wave2Opens: Date;       // הדלקת נרות - 60 דקות
  deadline: Date;         // הבדלה + 60 דקות (מעוגל לחצי שעה)
  kickoff: Date;          // deadline - 15 דקות
}

interface HebcalItem {
  title: string;
  category: string;
  date: string;
}

interface HebcalResponse {
  items: HebcalItem[];
}

// נחלים, ישראל - geonameid=294071
const NAHALIM_GEONAME_ID = 294071;

/**
 * Fetches Shabbat times from Hebcal API for Nahalim, Israel
 */
export async function getNextShabbatTimes(): Promise<ShabbatTimes> {
  const url = new URL('https://www.hebcal.com/shabbat');
  url.searchParams.set('cfg', 'json');
  url.searchParams.set('geonameid', NAHALIM_GEONAME_ID.toString());
  url.searchParams.set('M', 'on'); // Include Havdalah time

  const response = await fetch(url.toString());
  
  if (!response.ok) {
    throw new Error(`Hebcal API error: ${response.status}`);
  }

  const data: HebcalResponse = await response.json();
  
  let candleLighting: Date | null = null;
  let havdalah: Date | null = null;
  let shabbatDate: string | null = null;

  for (const item of data.items) {
    if (item.category === 'candles') {
      candleLighting = new Date(item.date);
      // Extract the Saturday date (day after candle lighting)
      const saturday = new Date(candleLighting);
      saturday.setDate(saturday.getDate() + 1);
      shabbatDate = saturday.toISOString().split('T')[0];
    } else if (item.category === 'havdalah') {
      havdalah = new Date(item.date);
    }
  }

  if (!candleLighting || !havdalah || !shabbatDate) {
    throw new Error('Could not find Shabbat times in Hebcal response');
  }

  return {
    date: shabbatDate,
    candleLighting,
    havdalah,
  };
}

/**
 * Rounds a date up to the nearest :00 or :30 minutes
 */
function roundUpToHalfHour(date: Date): Date {
  const result = new Date(date);
  const minutes = result.getMinutes();
  
  if (minutes === 0 || minutes === 30) {
    return result;
  }
  
  if (minutes < 30) {
    result.setMinutes(30, 0, 0);
  } else {
    result.setMinutes(0, 0, 0);
    result.setHours(result.getHours() + 1);
  }
  
  return result;
}

/**
 * Calculates all game times based on Shabbat times
 * 
 * Wave 1 (תושבים) = יום שישי 12:00
 * Wave 2 (כולם)   = candle_lighting - 60 דקות
 * Deadline        = havdalah + 60 דקות (מעוגל לחצי שעה)
 * Kickoff         = deadline - 15 דקות
 */
export function calculateGameTimes(shabbatTimes: ShabbatTimes): GameTimes {
  // Wave 1: Friday 12:00 (day before Saturday)
  const wave1Opens = new Date(shabbatTimes.date);
  wave1Opens.setDate(wave1Opens.getDate() - 1); // Friday
  wave1Opens.setHours(12, 0, 0, 0);

  // Wave 2: Candle lighting - 60 minutes
  const wave2Opens = new Date(shabbatTimes.candleLighting);
  wave2Opens.setMinutes(wave2Opens.getMinutes() - 60);

  // Deadline: Havdalah + 60 minutes, rounded up to :00 or :30
  const rawDeadline = new Date(shabbatTimes.havdalah);
  rawDeadline.setMinutes(rawDeadline.getMinutes() + 60);
  const deadline = roundUpToHalfHour(rawDeadline);

  // Kickoff: Deadline - 15 minutes
  const kickoff = new Date(deadline);
  kickoff.setMinutes(kickoff.getMinutes() - 15);

  return {
    wave1Opens,
    wave2Opens,
    deadline,
    kickoff,
  };
}
