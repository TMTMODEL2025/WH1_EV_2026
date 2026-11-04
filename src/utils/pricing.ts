export function getElectricityPrice(date: Date): { price: number; bracket: 'Peak' | 'Off-Peak' | 'Normal' } {
  // Peak: 09.00 - 22.00 (Mon-Fri) - Price 4.18
  // Off-Peak: 22.00 - 09.00 (Mon-Fri) - Price 2.60
  // Off-Peak: All day (Sat-Sun) - Price 2.60
  const day = date.getDay(); // 0 is Sunday, 6 is Saturday
  const hour = date.getHours();

  if (day >= 1 && day <= 5) {
    // Weekday
    if (hour >= 9 && hour < 22) {
      return { price: 4.1839, bracket: 'Peak' };
    } else {
      return { price: 2.6037, bracket: 'Off-Peak' };
    }
  } else {
    // Weekend
    return { price: 2.6037, bracket: 'Off-Peak' };
  }
}
