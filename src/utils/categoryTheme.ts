export interface CategoryTheme {
  name: string;
  color: string;
  bgColor: string;
  borderColor: string;
  iconType: 'cake' | 'flame' | 'coffee' | 'sparkles' | 'package';
}

export function getCategoryTheme(categoryName?: string): CategoryTheme {
  const norm = (categoryName || '').toLowerCase().trim();

  if (norm.includes('manis') || norm.includes('sweet') || norm.includes('cokelat')) {
    return {
      name: categoryName || 'Roti Manis',
      color: '#D97706',
      bgColor: '#FEF3C7',
      borderColor: '#FCD34D',
      iconType: 'cake',
    };
  }

  if (norm.includes('asin') || norm.includes('savory') || norm.includes('keju') || norm.includes('kornet') || norm.includes('telur')) {
    return {
      name: categoryName || 'Roti Asin',
      color: '#EA580C',
      bgColor: '#FFEDD5',
      borderColor: '#FDBA74',
      iconType: 'flame',
    };
  }

  if (norm.includes('minum') || norm.includes('drink') || norm.includes('kopi') || norm.includes('tea') || norm.includes('teh') || norm.includes('jus')) {
    return {
      name: categoryName || 'Minuman',
      color: '#0284C7',
      bgColor: '#E0F2FE',
      borderColor: '#BAE6FD',
      iconType: 'coffee',
    };
  }

  if (norm.includes('top') || norm.includes('tambah') || norm.includes('extra')) {
    return {
      name: categoryName || 'Topping',
      color: '#059669',
      bgColor: '#D1FAE5',
      borderColor: '#A7F3D0',
      iconType: 'sparkles',
    };
  }

  return {
    name: categoryName || 'Menu',
    color: '#6366F1',
    bgColor: '#EEF2FF',
    borderColor: '#C7D2FE',
    iconType: 'package',
  };
}
