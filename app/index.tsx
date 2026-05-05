import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  Alert, Animated, Easing, SafeAreaView,
} from 'react-native';
import MapView, { Marker, PROVIDER_DEFAULT } from 'react-native-maps';
import * as Location from 'expo-location';
import { Audio } from 'expo-av';
import { Ionicons } from '@expo/vector-icons';

const GREEN  = '#3ddc84';
const BG     = '#0a0f0d';
const BG3    = '#192420';
const BORDER = 'rgba(61,220,132,0.15)';
const DIM    = '#7a9b84';
const MUTED  = '#3d5445';

interface SoundPin {
  id: string;
  lat: number;
  lng: number;
  label: string;
  duration: number;
  uri: string;
}

export default function MapScreen() {
  const [location, setLocation] = useState<Location.LocationObject | null>(null);
  const [locName,  setLocName]  = useState('Zisťujem polohu…');
  const [pins,     setPins]     = useState<SoundPin[]>([]);
  const [isRec,    setIsRec]    = useState(false);
  const [seconds,  setSeconds]  = useState(0);
  const [selected, setSelected] = useState<SoundPin | null>(null);
  const [playing,  setPlaying]  = useState(false);

  const recRef   = useRef<Audio.Recording | null>(null);
  const soundRef = useRef<Audio.Sound | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const ring1    = useRef(new Animated.Value(1)).current;
  const ring2    = useRef(new Animated.Value(1)).current;
  const ring1Op  = useRef(new Animated.Value(0)).current;
  const ring2Op  = useRef(new Animated.Value(0)).current;
  const loopRef  = useRef<Animated.CompositeAnimation | null>(null);

  useEffect(() => {
    (async () => {
      const { status: mic } = await Audio.requestPermissionsAsync();
      if (mic !== 'granted') Alert.alert('Mikrofón', 'Povolenie mikrofónu je potrebné.');

      const { status: loc } = await Location.requestForegroundPermissionsAsync();
      if (loc !== 'granted') { Alert.alert('Poloha', 'Povolenie polohy je potrebné.'); return; }

      await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.High, distanceInterval: 10 },
        async (l) => {
          setLocation(l);
          try {
            const geo = await Location.reverseGeocodeAsync(l.coords);
            if (geo[0]) {
              const { district, city, country } = geo[0];
              setLocName([district || city, country].filter(Boolean).join(', '));
            }
          } catch {}
        }
      );
    })();
    return () => { timerRef.current && clearInterval(timerRef.current); };
  }, []);

  const startRings = () => {
    loopRef.current = Animated.loop(
      Animated.parallel([
        Animated.sequence([
          Animated.timing(ring1Op, { toValue: 0.6, duration: 0, useNativeDriver: true }),
          Animated.parallel([
            Animated.timing(ring1,   { toValue: 1.8, duration: 1200, useNativeDriver: true, easing: Easing.out(Easing.ease) }),
            Animated.timing(ring1Op, { toValue: 0,   duration: 1200, useNativeDriver: true }),
          ]),
        ]),
        Animated.sequence([
          Animated.delay(400),
          Animated.timing(ring2Op, { toValue: 0.6, duration: 0, useNativeDriver: true }),
          Animated.parallel([
            Animated.timing(ring2,   { toValue: 1.8, duration: 1200, useNativeDriver: true, easing: Easing.out(Easing.ease) }),
            Animated.timing(ring2Op, { toValue: 0,   duration: 1200, useNativeDriver: true }),
          ]),
        ]),
      ])
    );
    loopRef.current.start();
  };

  const stopRings = () => {
    loopRef.current?.stop();
    ring1.setValue(1); ring2.setValue(1);
    ring1Op.setValue(0); ring2Op.setValue(0);
  };

  const startRecording = async () => {
    if (!location) { Alert.alert('Počkaj', 'Čakám na GPS signál…'); return; }
    try {
      setSeconds(0);
      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
      const { recording } = await Audio.Recording.createAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
      recRef.current = recording;
      setIsRec(true);
      startRings();
      timerRef.current = setInterval(() => {
        setSeconds(s => { if (s >= 59) { stopRecording(); return 59; } return s + 1; });
      }, 1000);
    } catch { Alert.alert('Chyba', 'Nahrávanie sa nepodarilo spustiť.'); }
  };

  const stopRecording = async () => {
    if (!recRef.current || !location) return;
    clearInterval(timerRef.current!);
    stopRings();
    setIsRec(false);
    try {
      await recRef.current.stopAndUnloadAsync();
      const uri = recRef.current.getURI();
      recRef.current = null;
      if (uri) {
        const pin: SoundPin = {
          id: Date.now().toString(),
          lat: location.coords.latitude,
          lng: location.coords.longitude,
          label: locName,
          duration: seconds,
          uri,
        };
        setPins(p => [...p, pin]);
        setSelected(pin);
      }
    } catch { recRef.current = null; }
  };

  const playSound = async (pin: SoundPin) => {
    try {
      if (soundRef.current) { await soundRef.current.unloadAsync(); soundRef.current = null; setPlaying(false); }
      if (playing && selected?.id === pin.id) return;
      await Audio.setAudioModeAsync({ allowsRecordingIOS: false, playsInSilentModeIOS: true });
      const { sound } = await Audio.Sound.createAsync({ uri: pin.uri }, { shouldPlay: true });
      soundRef.current = sound;
      setPlaying(true);
      sound.setOnPlaybackStatusUpdate(st => { if (st.isLoaded && st.didJustFinish) setPlaying(false); });
    } catch { Alert.alert('Chyba', 'Zvuk sa nepodarilo prehrať.'); }
  };

  const mm = String(Math.floor(seconds / 60)).padStart(2, '0');
  const ss = String(seconds % 60).padStart(2, '0');

  const region = location
    ? { latitude: location.coords.latitude, longitude: location.coords.longitude, latitudeDelta: 0.01, longitudeDelta: 0.01 }
    : { latitude: 48.1486, longitude: 17.1077, latitudeDelta: 0.05, longitudeDelta: 0.05 };

  return (
    <View style={s.root}>
      <MapView
        style={StyleSheet.absoluteFillObject}
        provider={PROVIDER_DEFAULT}
        userInterfaceStyle="dark"
        region={region}
        showsUserLocation
      >
        {pins.map(pin => (
          <Marker key={pin.id} coordinate={{ latitude: pin.lat, longitude: pin.lng }} onPress={() => setSelected(pin)}>
            <View style={s.pinDot} />
          </Marker>
        ))}
      </MapView>

      {/* TOP */}
      <SafeAreaView style={s.top}>
        <View style={s.locBadge}>
          <View style={[s.locDot, location && { backgroundColor: GREEN }]} />
          <Text style={s.locTxt} numberOfLines={1}>{locName}</Text>
        </View>
        {pins.length > 0 && (
          <View style={s.countBadge}>
            <Text style={s.countTxt}>{pins.length} 🎙</Text>
          </View>
        )}
      </SafeAreaView>

      {/* POPUP */}
      {selected && (
        <View style={s.popup}>
          <View style={s.popupRow}>
            <View style={{ flex: 1 }}>
              <Text style={s.popupTitle} numberOfLines={1}>{selected.label}</Text>
              <Text style={s.popupMeta}>{selected.duration}s nahraté</Text>
            </View>
            <TouchableOpacity onPress={() => { setSelected(null); setPlaying(false); soundRef.current?.unloadAsync(); }}>
              <Ionicons name="close" size={18} color={MUTED} />
            </TouchableOpacity>
          </View>
          <TouchableOpacity style={s.playBtn} onPress={() => playSound(selected)}>
            <Ionicons name={playing ? 'pause' : 'play'} size={18} color={BG} />
            <Text style={s.playTxt}>{playing ? 'Prehráva sa…' : 'Prehrať zvuk'}</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* RECORD BUTTON */}
      <View style={s.recWrap}>
        {isRec && (
          <>
            <Animated.View style={[s.ring, { transform: [{ scale: ring1 }], opacity: ring1Op }]} />
            <Animated.View style={[s.ring, { transform: [{ scale: ring2 }], opacity: ring2Op }]} />
          </>
        )}
        <TouchableOpacity style={[s.recBtn, isRec && { backgroundColor: '#e53e3e' }]} onPress={() => isRec ? stopRecording() : startRecording()} activeOpacity={0.85}>
          <Ionicons name={isRec ? 'stop' : 'mic'} size={28} color={isRec ? '#fff' : BG} />
        </TouchableOpacity>
        <Text style={s.recLabel}>{isRec ? `${mm}:${ss}` : 'Nahrať'}</Text>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  root:       { flex: 1, backgroundColor: BG },
  top:        { paddingHorizontal: 16, paddingTop: 8, flexDirection: 'row', gap: 8 },
  locBadge:   { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: 'rgba(10,15,13,0.9)', borderRadius: 999, borderWidth: 0.5, borderColor: BORDER, paddingHorizontal: 14, paddingVertical: 9 },
  locDot:     { width: 8, height: 8, borderRadius: 4, backgroundColor: MUTED },
  locTxt:     { fontSize: 13, color: DIM, flex: 1 },
  countBadge: { backgroundColor: 'rgba(10,15,13,0.9)', borderRadius: 999, borderWidth: 0.5, borderColor: BORDER, paddingHorizontal: 12, paddingVertical: 9 },
  countTxt:   { fontSize: 13, color: GREEN },
  pinDot:     { width: 16, height: 16, borderRadius: 8, backgroundColor: GREEN, borderWidth: 2.5, borderColor: BG },
  popup:      { position: 'absolute', bottom: 120, left: 16, right: 16, backgroundColor: BG3, borderRadius: 20, borderWidth: 0.5, borderColor: BORDER, padding: 16 },
  popupRow:   { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 12 },
  popupTitle: { fontSize: 15, fontWeight: '600', color: '#e8f0eb' },
  popupMeta:  { fontSize: 12, color: DIM, marginTop: 3 },
  playBtn:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: GREEN, borderRadius: 12, paddingVertical: 12 },
  playTxt:    { fontSize: 14, fontWeight: '600', color: BG },
  recWrap:    { position: 'absolute', bottom: 36, alignSelf: 'center', alignItems: 'center', gap: 6 },
  ring:       { position: 'absolute', width: 72, height: 72, borderRadius: 36, borderWidth: 1.5, borderColor: GREEN },
  recBtn:     { width: 72, height: 72, borderRadius: 36, backgroundColor: GREEN, alignItems: 'center', justifyContent: 'center' },
  recLabel:   { fontSize: 12, color: MUTED },
});
