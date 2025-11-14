// src/hooks/useSelectableOptions.ts
import { useState } from "react";

export const useSelectableOptions = (keys: string[]) => {
  const [selected, setSelected] = useState(keys);

  const toggle = (key: string) => {
    setSelected((prev) =>
      prev.includes(key)
        ? prev.filter((v) => v !== key)
        : [...prev, key]
    );
  };

  const toggleAll = () => {
    setSelected((prev) => (prev.length === keys.length ? [] : keys));
  };

  return { selected, toggle, toggleAll };
};
