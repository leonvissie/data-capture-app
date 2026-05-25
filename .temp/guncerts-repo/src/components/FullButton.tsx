import React from 'react';
import Button, { ButtonProps } from './Button';

const FullButton: React.FC<ButtonProps> = (props) => (
  <Button {...props} />
);

export default FullButton;
