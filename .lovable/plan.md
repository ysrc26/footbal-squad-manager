

## תיקון בקשת הרשאות מיקום לצ'ק-אין

### הבעיה
כשמשתמש לוחץ על "סרוק QR לצ'ק-אין", הסורק נפתח מיד אבל **הבקשה להרשאת מיקום מגיעה רק אחרי סריקה מוצלחת**. אם המשתמש עוד לא אישר הרשאות מיקום, הוא רואה הודעת שגיאה במקום בקשת הרשאה מסודרת מהדפדפן.

### הפתרון
לבקש הרשאת מיקום **לפני** פתיחת סורק ה-QR:

1. כשמשתמש לוחץ על כפתור "סרוק QR", נבקש קודם גישה למיקום
2. אם המשתמש מאשר → הסורק נפתח
3. אם המשתמש דוחה → מוצגת הודעה ברורה שנדרשת הרשאת מיקום

### שינויים נדרשים

**קובץ: `src/components/QrScanner.tsx`**

**1. עדכון הפונקציה `openScanner`:**

```typescript
const openScanner = async () => {
  setErrorMessage('');
  
  // בדיקה שהדפדפן תומך במיקום
  if (!navigator.geolocation) {
    toast.error('הדפדפן לא תומך במיקום GPS');
    return;
  }

  // בקשת הרשאת מיקום לפני פתיחת הסורק
  try {
    await new Promise<GeolocationPosition>((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(resolve, reject, {
        enableHighAccuracy: true,
        timeout: 10000,
      });
    });
    
    // הרשאה התקבלה - פתיחת הסורק
    setStatus('scanning');
    setIsOpen(true);
  } catch (error: any) {
    // הרשאה נדחתה או שגיאה אחרת
    if (error.code === 1) { // PERMISSION_DENIED
      toast.error('יש לאשר גישה למיקום כדי לבצע צ\'ק-אין', {
        description: 'לחץ על סמל הנעילה בשורת הכתובת ואפשר גישה למיקום',
        duration: 5000,
      });
    } else {
      toast.error('לא ניתן לקבל מיקום', {
        description: 'נסה שוב או בדוק שהמיקום מופעל במכשיר',
      });
    }
  }
};
```

**2. הוספת מצב `requesting_location` (אופציונלי - לחוויה טובה יותר):**

נוסיף מצב ביניים שמראה למשתמש שאנחנו מבקשים הרשאת מיקום:

```typescript
type ScanStatus = 'idle' | 'requesting_location' | 'scanning' | 'verifying' | 'success' | 'error';
```

**3. הצגת מסך טעינה בזמן בקשת הרשאה:**

בכפתור הסורק, אם `status === 'requesting_location'`:
```typescript
<Button disabled className="w-full h-14 ...">
  <Loader2 className="h-6 w-6 animate-spin" />
  מבקש הרשאת מיקום...
</Button>
```

### תרשים זרימה חדש

```text
לחיצה על "סרוק QR"
        ↓
   בקשת הרשאת מיקום
        ↓
    ┌─────┴─────┐
    ↓           ↓
 אושר        נדחה
    ↓           ↓
פתיחת סורק   הודעת שגיאה
    ↓        עם הנחיות
 סריקת QR
    ↓
 אימות מיקום
    ↓
  צ'ק-אין!
```

### סיכום השינויים

| קובץ | שינוי |
|------|-------|
| `QrScanner.tsx` | עדכון `openScanner` לבקש הרשאה לפני פתיחת הסורק |
| `QrScanner.tsx` | הוספת מצב `requesting_location` |
| `QrScanner.tsx` | הצגת הודעה ברורה כשהמשתמש דוחה הרשאת מיקום |

