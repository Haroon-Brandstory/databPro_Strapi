import { useEffect, useRef } from 'react';
import pluginId from '../pluginId';

type Props = {
  setPlugin: (id: string) => void;
};

const Initializer = ({ setPlugin }: Props) => {
  const ref = useRef(setPlugin);

  useEffect(() => {
    ref.current(pluginId);
  }, []);

  return null;
};

export default Initializer;
