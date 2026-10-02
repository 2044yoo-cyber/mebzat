import React from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors } from '../theme';

type Props = { visible: boolean; onClose: () => void; onPost: () => void; onProperty: () => void };

export function CreateSheet({ visible, onClose, onPost, onProperty }: Props) {
  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={() => {}}>
          <View style={styles.handle} />
          <Text style={styles.title}>Create on Medosha</Text>
          <Text style={styles.subtitle}>Choose what you want to add.</Text>
          <Pressable onPress={onPost} style={({ pressed }) => [styles.item, pressed && styles.pressed]}><View style={styles.icon}><Text style={styles.iconText}>✎</Text></View><View style={{ flex: 1 }}><Text style={styles.itemTitle}>Create post</Text><Text style={styles.itemBody}>Share progress, design, question or update</Text></View><Text style={styles.arrow}>›</Text></Pressable>
          <Pressable onPress={onProperty} style={({ pressed }) => [styles.item, pressed && styles.pressed]}><View style={styles.icon}><Text style={styles.iconText}>⌂</Text></View><View style={{ flex: 1 }}><Text style={styles.itemTitle}>List property</Text><Text style={styles.itemBody}>Add a property for sale or rent</Text></View><Text style={styles.arrow}>›</Text></Pressable>
          <View style={styles.next}><Text style={styles.nextText}>More creation tools are coming next.</Text></View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.62)' },
  sheet: { backgroundColor: colors.surface, borderTopLeftRadius: 26, borderTopRightRadius: 26, borderWidth: 1, borderColor: colors.border, padding: 18, paddingBottom: 34 },
  handle: { alignSelf: 'center', width: 44, height: 4, borderRadius: 2, backgroundColor: colors.border, marginBottom: 16 },
  title: { color: colors.text, fontSize: 23, fontWeight: '900' },
  subtitle: { color: colors.muted, marginTop: 3, marginBottom: 14 },
  item: { minHeight: 74, borderRadius: 17, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface2, marginTop: 10, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 12 },
  icon: { width: 44, height: 44, borderRadius: 14, backgroundColor: colors.blue, alignItems: 'center', justifyContent: 'center' },
  iconText: { color: '#fff', fontWeight: '900', fontSize: 21 },
  itemTitle: { color: colors.text, fontWeight: '900', fontSize: 15 },
  itemBody: { color: colors.muted, fontSize: 11, marginTop: 3 },
  arrow: { color: colors.muted, fontSize: 28 },
  next: { marginTop: 14, padding: 12, borderRadius: 13, backgroundColor: colors.white08 },
  nextText: { color: colors.muted, fontSize: 11, textAlign: 'center' },
  pressed: { opacity: 0.75 },
});
