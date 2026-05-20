import { useState, useEffect, useCallback } from 'react';

const STORAGE_KEY = 'Copa-Yantai-favorites';

function readFavorites() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

export function useFavorites() {
  const [favorites, setFavorites] = useState(readFavorites);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(favorites));
  }, [favorites]);

  const toggleFavorite = useCallback((teamIso) => {
    setFavorites((prev) =>
      prev.includes(teamIso)
        ? prev.filter((iso) => iso !== teamIso)
        : [...prev, teamIso]
    );
  }, []);

  const isFavorite = useCallback(
    (teamIso) => favorites.includes(teamIso),
    [favorites]
  );

  return { favorites, toggleFavorite, isFavorite };
}
