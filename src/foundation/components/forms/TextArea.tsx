import { TextField } from './TextField';

export function TextArea(props: Parameters<typeof TextField>[0]) {
  return <TextField multiline numberOfLines={4} textAlignVertical="top" {...props} />;
}
