/**
 * Automatic game creation logic
 * Creates weekly games on Sunday morning for the upcoming Shabbat
 */

import { supabase } from '@/integrations/supabase/client';
import { getNextShabbatTimes, calculateGameTimes } from './hebcal';

const DEFAULT_MAX_PLAYERS = 15;
const DEFAULT_MAX_STANDBY = 10;

interface CreateGameResult {
  success: boolean;
  message: string;
  gameId?: string;
}

/**
 * Checks if a game already exists for the given date
 */
async function checkExistingGame(date: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('games')
    .select('id')
    .eq('date', date)
    .maybeSingle();

  if (error) {
    console.error('Error checking existing game:', error);
    throw error;
  }

  return !!data;
}

/**
 * Creates an automatic weekly game based on Shabbat times from Hebcal API
 */
export async function createWeeklyGame(): Promise<CreateGameResult> {
  try {
    // 1. Fetch Shabbat times from Hebcal
    const shabbatTimes = await getNextShabbatTimes();

    // 2. Check if game already exists for this Shabbat
    const exists = await checkExistingGame(shabbatTimes.date);
    if (exists) {
      return {
        success: false,
        message: `משחק כבר קיים לתאריך ${shabbatTimes.date}`,
      };
    }

    // 3. Calculate all game times
    const times = calculateGameTimes(shabbatTimes);

    // 4. Create the game
    const { data, error } = await supabase
      .from('games')
      .insert({
        date: shabbatTimes.date,
        kickoff_time: times.kickoff.toISOString(),
        deadline_time: times.deadline.toISOString(),
        candle_lighting: shabbatTimes.candleLighting.toISOString(),
        shabbat_end: shabbatTimes.havdalah.toISOString(),
        wave1_registration_opens_at: times.wave1Opens.toISOString(),
        registration_opens_at: times.wave2Opens.toISOString(),
        status: 'scheduled',
        is_auto_generated: true,
        max_players: DEFAULT_MAX_PLAYERS,
        max_standby: DEFAULT_MAX_STANDBY,
      })
      .select('id')
      .single();

    if (error) throw error;

    return {
      success: true,
      message: `משחק נוצר בהצלחה לשבת ${shabbatTimes.date}`,
      gameId: data.id,
    };
  } catch (error: any) {
    console.error('Error creating weekly game:', error);
    return {
      success: false,
      message: `שגיאה ביצירת משחק: ${error.message}`,
    };
  }
}

/**
 * Gets formatted info about the next Shabbat times
 */
export async function getShabbatInfo() {
  const shabbatTimes = await getNextShabbatTimes();
  const gameTimes = calculateGameTimes(shabbatTimes);
  
  return {
    shabbatDate: shabbatTimes.date,
    candleLighting: shabbatTimes.candleLighting,
    havdalah: shabbatTimes.havdalah,
    ...gameTimes,
  };
}
