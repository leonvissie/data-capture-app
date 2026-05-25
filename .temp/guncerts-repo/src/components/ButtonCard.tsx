import React from 'react';
import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import DocumentActionCard from './DocumentActionCard';
import Button, { ButtonProps } from './Button';

export type ButtonCardAction = Omit<ButtonProps, 'fullWidth'> & { id?: string };

type ButtonCardProps = {
  title: string;
  buttons: ButtonCardAction[];
  columns?: number;
  rows?: number;
  centerText?: boolean;
  subtitle?: string;
  status?: string;
  statusColor?: string;
  onHelp?: () => void;
  helpLabel?: string;
  style?: StyleProp<ViewStyle>;
  titleNumberOfLines?: number;
  contentStyle?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
};

const ButtonCard: React.FC<ButtonCardProps> = ({
  title,
  buttons,
  columns = 1,
  rows,
  centerText = false,
  subtitle,
  status,
  statusColor,
  onHelp,
  helpLabel,
  style,
  titleNumberOfLines,
  contentStyle,
  children,
}) => {
  const columnCount = Math.max(1, Math.floor(columns));
  const rowCount = rows !== undefined ? Math.max(1, Math.floor(rows)) : undefined;
  const shouldCenterText = centerText;
  const maxButtons = rowCount ? rowCount * columnCount : buttons.length;
  const visibleButtons = buttons.slice(0, maxButtons);

  const chunked: ButtonCardAction[][] = [];
  for (let i = 0; i < visibleButtons.length; i += columnCount) {
    chunked.push(visibleButtons.slice(i, i + columnCount));
  }

  return (
    <DocumentActionCard
      title={title}
      subtitle={subtitle}
      status={status}
      statusColor={statusColor}
      onHelp={onHelp}
      helpLabel={helpLabel}
      actions={[]}
      style={style}
      titleNumberOfLines={titleNumberOfLines}
    >
      <View style={[styles.actions, contentStyle]}>
        {children}
        {chunked.map((rowButtons, rowIdx) => (
          <View key={`row-${rowIdx}`} style={styles.row}>
            {rowButtons.map(({ id, style: buttonStyle, centerText: buttonCenter, ...button }, idx) => (
              <Button
                key={id ?? button.testID ?? `${button.label}-${rowIdx}-${idx}`}
                fullWidth={columnCount === 1}
                centerText={buttonCenter ?? shouldCenterText}
                style={[styles.button, columnCount > 1 ? styles.buttonGrid : null, buttonStyle]}
                {...button}
              />
            ))}
          </View>
        ))}
      </View>
    </DocumentActionCard>
  );
};

const styles = StyleSheet.create({
  actions: {
    gap: 12,
  },
  row: {
    flexDirection: 'row',
    gap: 12,
  },
  button: {
    alignSelf: 'stretch',
  },
  buttonGrid: {
    flex: 1,
  },
});

export default ButtonCard;
