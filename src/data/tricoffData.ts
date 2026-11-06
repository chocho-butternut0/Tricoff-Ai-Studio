export type DrinkId = 'regular' | 'sweetened' | 'decaf';

export interface Drink {
  id: DrinkId;
  functionCode: string;
  name: string;
  shortLabel: string;
  slot: number;
  price: number;
  subtitle: string;
  description: string;
  volume: string;
  caffeine: string;
  sweetnessProfile: string;
  tastingNotes: string;
  extractionSeconds: number;
  temperature: string;
  image: string;
  badgeNote: string;
  tags: string[];
}

export const VOLUME_ML = 200;

export const DRINKS: Drink[] = [
  {
    id: 'regular',
    functionCode: 'FN-01',
    name: 'Regular Roast',
    shortLabel: 'Regular',
    slot: 1,
    price: 45,
    subtitle: 'Pure Unsweetened Highland Arabica',
    description:
      'Freshly ground whole-bean Benguet Arabica and Bukidnon Robusta extracted at 9 bars with a crisp hot-water bypass for a clean, full-bodied black cup.',
    volume: '240 ml',
    caffeine: '145 mg',
    sweetnessProfile: '0g Sugar · Unsweetened',
    tastingNotes: 'Toasted cacao · Roasted hazelnut · Crisp finish',
    extractionSeconds: 32,
    temperature: '88°C',
    image: '/assets/images/regular-coffee.png',
    badgeNote: 'Benguet Harvest · 88°C Hot',
    tags: ['Benguet Arabica', 'Zero Sugar', '9-Bar Extract', '240 ml'],
  },
  {
    id: 'sweetened',
    functionCode: 'FN-02',
    name: 'Sweetened Blend',
    shortLabel: 'Sweetened',
    slot: 2,
    price: 50,
    subtitle: 'Balanced Roast with Raw Muscovado Cane',
    description:
      'Rich double-shot extraction precision-blended inside the mixing chamber with warm Negros Occidental raw muscovado cane reduction for a smooth, caramelized cup.',
    volume: '240 ml',
    caffeine: '140 mg',
    sweetnessProfile: '11g Raw Muscovado Cane Infusion',
    tastingNotes: 'Warm caramel · Brown butter · Velvety crema',
    extractionSeconds: 35,
    temperature: '87°C',
    image: '/assets/images/sweetened-coffee.png',
    badgeNote: 'Raw Muscovado Infusion · 87°C',
    tags: ['Double Shot', 'Raw Muscovado', 'Warm Caramel', '240 ml'],
  },
  {
    id: 'decaf',
    functionCode: 'FN-03',
    name: 'Swiss Water Decaf',
    shortLabel: 'Decaf',
    slot: 3,
    price: 55,
    subtitle: '99.9% Caffeine-Free Chemical-Free Roast',
    description:
      'Single-origin beans decaffeinated via pure Swiss Water osmosis and ground through an isolated burr grinder so zero residual caffeine enters your cup.',
    volume: '240 ml',
    caffeine: '2 mg (99.9% Caffeine-Free)',
    sweetnessProfile: '0g Sugar · Natural Malt Sweetness',
    tastingNotes: 'Dark chocolate · Toasted almond · Low-acid finish',
    extractionSeconds: 36,
    temperature: '88°C',
    image: '/assets/images/decaf-coffee.png',
    badgeNote: 'Pure Osmosis Decaf · 88°C Hot',
    tags: ['Swiss Water', '99.9% Decaf', 'Low Acid', '240 ml'],
  },
];
