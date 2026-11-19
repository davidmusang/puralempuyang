import { motion } from 'framer-motion';

const MetricCard = ({ title, value, subtitle, icon: Icon }) => (
  <motion.div
    initial={{ opacity: 0, y: 20 }}
    animate={{ opacity: 1, y: 0 }}
    className="glass-panel rounded-2xl sm:rounded-3xl p-3.5 sm:p-5"
  >
    <div className="flex items-start justify-between gap-2">
      <p className="text-xs sm:text-sm text-ebony/60 dark:text-cream/70">{title}</p>
      {Icon && <Icon className="shrink-0 text-gold" size={18} />}
    </div>
    <p className="mt-2 sm:mt-3 text-xl sm:text-2xl font-semibold text-ebony dark:text-cream break-words">{value}</p>
    {subtitle && <p className="mt-1 text-xs text-ebony/50 dark:text-cream/60">{subtitle}</p>}
  </motion.div>
);

export default MetricCard;
