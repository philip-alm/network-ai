import { Text, View } from 'react-native';
import { helloFromAppPackage } from '@reknowable/app';

export default function HomeScreen() {
  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
      <Text style={{ fontSize: 24, fontWeight: 'bold' }}>reknowable</Text>
      <Text testID="hello-from-app">{helloFromAppPackage()}</Text>
      <Text style={{ color: '#666', marginTop: 16 }}>Phase 0 scaffold</Text>
    </View>
  );
}
