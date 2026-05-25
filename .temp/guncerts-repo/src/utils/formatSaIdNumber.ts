export const formatSaIdNumber = (value: string) => {
  const digits = `${value ?? ''}`.replace(/\D/g, '').slice(0, 13);
  if (digits.length <= 6) return digits;
  if (digits.length <= 10) return `${digits.slice(0, 6)} ${digits.slice(6)}`;
  if (digits.length <= 12) return `${digits.slice(0, 6)} ${digits.slice(6, 10)} ${digits.slice(10)}`;
  return `${digits.slice(0, 6)} ${digits.slice(6, 10)} ${digits.slice(10, 12)} ${digits.slice(12)}`;
};

