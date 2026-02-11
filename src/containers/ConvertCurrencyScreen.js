import { useEffect, useRef, useState } from 'react';
import Icon from 'react-native-vector-icons/FontAwesome5';
import AsyncStorage from '@react-native-async-storage/async-storage';
import DraggableFlatList, { OpacityDecorator } from 'react-native-draggable-flatlist';
import UnitValue from '../components/UnitValue';
import ListUnitItem from '../components/ListUnitItem';
import Snackbar from 'react-native-snackbar';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { Text, useTheme } from '@rneui/themed';
import { convertCurrency, getEuropeanCentralBankRates } from '../utils/currencies';
import { useTranslation } from 'react-i18next';
import { fractionToNumber } from '../utils/conversion';
import { Button } from '@rneui/base';
import { ActivityIndicator } from 'react-native';


const ConvertCurrencyScreen = ({ navigation }) => {

  const defaultUnit = {iso: 'EUR', name: 'Euro', symbol: '€', emoji: '🇪🇺'};

  const { t } = useTranslation();
  const isInitialized = useRef(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [refUnit, setRefUnit] = useState(defaultUnit);
  const [value, setValue] = useState(0);
  const [fxRate, setFxRate] = useState({});
  const { theme } = useTheme();

  const bgColor = theme.mode === 'light' ? theme.colors.disabled : theme.colors.background;

  const onDragEnd = ({data}) => {
    const newFxRate = {
      ...fxRate,
      rates: data
    };

    setFxRate(newFxRate);
    saveCurrencyOrder(data);
  }
  
  const keyExtractor = (item, _index) => item.iso;

  const renderItem = ({ item, drag }) => {
    const isReferenceUnit = item.iso == refUnit.iso;

    let trueValue = value;
    const isFractional = value.toString().includes('/');
    if (isFractional) {
      trueValue = fractionToNumber(value);
    }

    let unityValue = isReferenceUnit ? parseFloat(trueValue) : convertCurrency(refUnit, item, trueValue);
    if (isNaN(unityValue)) {
      unityValue = '?';
    } else {
      unityValue = unityValue.toLocaleString();
    }

    return (
      <OpacityDecorator activeOpacity={0.5}>
        <TouchableOpacity
          activeOpacity={1}
          onLongPress={drag}
        >
          <ListUnitItem
            unit={item}
            value={unityValue}
            isReferenceUnit={isReferenceUnit}
            setRefUnit={saveCurrencyFavorite}
          />
        </TouchableOpacity>
      </OpacityDecorator>
    );
  }

  const initFxRate = async () => {
    const savedFxRate = await AsyncStorage.getItem(`unitstool_currency_fxRate`);
    if (savedFxRate !== null) {
      const objFxRate = JSON.parse(savedFxRate);
      const now = new Date();
      const today = `${now.getFullYear()}-${(now.getMonth()+1).toString().padStart(2, '0')}-${now.getDate()}`;
      const isWeekend = now.getDay() === 0 || now.getDay() === 6;
      // The BCE doesn't update the week-end, so check it
      if (objFxRate.day === undefined || (!isWeekend && today !== objFxRate.day)) {
        fetchFxRate();
      } else {
        loadCurrencyOrder(objFxRate);
      }
    } else {
      fetchFxRate();
    }
  }

  const fetchFxRate = async () => {
    setIsRefreshing(true);
    
    let lastFxRate = await getEuropeanCentralBankRates();
    if (lastFxRate.day !== undefined) {
      saveFxRate(lastFxRate);
    } else {
      Snackbar.show({
        text: t('failToFetchCurrency'),
        duration: Snackbar.LENGTH_LONG,
        action: {
          text: 'OK',
          textColor: theme.colors.success
        },
      });
      // Use last saved if exist
      const savedFxRate = await AsyncStorage.getItem(`unitstool_currency_fxRate`);
      if (savedFxRate !== null) {
        loadCurrencyOrder(JSON.parse(savedFxRate));
      }
    }

    setIsRefreshing(false);
  }

  const loadCurrencyOrder = async (fxRate) => {
    try {
      const value = await AsyncStorage.getItem(`unitstool_currency_order`);
      if (value !== null && value.length > 0) {
        const savedCurrencies = JSON.parse(value);
        const isCoherent =
          fxRate.rates?.length === savedCurrencies.length
          && fxRate.rates?.every(currency => savedCurrencies.includes(currency.iso));

        if (isCoherent) {
          const newFxRate = {
            ...fxRate,
            rates: savedCurrencies.map(iso => fxRate.rates.find(rate => rate.iso === iso))
          };
      
          setFxRate(newFxRate);
        } else {
          await AsyncStorage.removeItem(`unitstool_currency_order`);
          setFxRate(fxRate);
        }
      } else {
        setFxRate(fxRate);
      }
    } catch(e) {
      setFxRate(fxRate);
    }
  }

  const saveCurrencyOrder = async (value) => {
    try {
      // To always get the updated rate, only store the iso code
      const jsonStrValue = JSON.stringify(value.map(currency => currency.iso));
      await AsyncStorage.setItem(`unitstool_currency_order`, jsonStrValue);
    } catch (e) {
      console.error(e);
    }
  }

  const loadCurrencyFavorite = async () => {
    try {
      const value = await AsyncStorage.getItem(`unitstool_currency_favorite`);
      if (value !== null && value.length > 0) {
        setRefUnit(JSON.parse(value));
      }
    } catch(e) {
    }
  }

  const saveCurrencyFavorite = async (value) => {
    try {
      const jsonStrValue = JSON.stringify(value);
      await AsyncStorage.setItem(`unitstool_currency_favorite`, jsonStrValue);
      setRefUnit(value);
    } catch (e) {
      console.error(e);
    }
  }

  const saveFxRate = async (value) => {
    try {
      const jsonStrValue = JSON.stringify(value);
      await AsyncStorage.setItem(`unitstool_currency_fxRate`, jsonStrValue);
      await loadCurrencyOrder(value);
    } catch (e) {
      console.error(e);
    }
  }

  useEffect(() => {
    if (!isInitialized.current) {
      initFxRate();
      loadCurrencyFavorite();
    }

    return () => {
      isInitialized.current = true;
    };
  }, []);

  return (
    <View style={[ styles.container, {
      alignItems: 'center',
      backgroundColor: bgColor
    }]}>
        <UnitValue
          value={value.toString()}
          setValue={setValue}
          unit={refUnit}
        />
        <View style={{display: 'flex', flexDirection: 'row', alignItems: 'center'}}>
          <Text>{t('update')}: {fxRate.day} ({t('sourceECB')})</Text>
          <Button size='sm' type='clear' color={theme.colors.white} onPress={fetchFxRate} disabled={isRefreshing}>
            <Icon name="sync" solid={false} size={24} color={theme.colors.primary}/>
          </Button>
        </View>
        {isRefreshing && <ActivityIndicator size="large" />}
        <View style={{flex: 1, width: '100%'}}>
          <DraggableFlatList
            data={fxRate.rates ?? []}
            refreshing={isRefreshing}
            renderItem={renderItem}
            keyExtractor={keyExtractor}
            onDragEnd={onDragEnd}
          />
        </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  }
});

export default ConvertCurrencyScreen;