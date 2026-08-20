import { column, Schema, Table } from '@powersync/react-native';

const tripsTable = new Table({
  user_id: column.text,
  trip_name: column.text,
  origin: column.text,
  destination: column.text,
  start_date: column.text,
  end_date: column.text,
  transport_data: column.text, // Tutaj wrzucimy JSON
  lodging_data: column.text,   // Tutaj wrzucimy JSON
  attractions_data: column.text, // Tutaj wrzucimy JSON
  created_at: column.text
});

export const AppSchema = new Schema({
  trips: tripsTable
});