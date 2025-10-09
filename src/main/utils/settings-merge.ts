function isObject(item: any): item is Record<string, any> {
  return (item && typeof item === 'object' && !Array.isArray(item));
}

function deepMerge<T extends object, U extends object>(target: T, source: U): T & U {
  const output = { ...target } as T & U;

  if (isObject(target) && isObject(source)) {
    for (const key in source) {
      if (Object.prototype.hasOwnProperty.call(source, key)) {
        const sourceValue = source[key];
        const targetValue = (target as Record<string, any>)[key];

        if (isObject(targetValue) && isObject(sourceValue)) {
          (output as Record<string, any>)[key] = deepMerge(targetValue, sourceValue);
        } else {
          (output as Record<string, any>)[key] = sourceValue;
        }
      }
    }
  }

  return output;
}

export {
  deepMerge,
};