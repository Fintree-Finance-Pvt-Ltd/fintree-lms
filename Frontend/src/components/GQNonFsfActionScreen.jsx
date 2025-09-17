import React from 'react'
import LoginActionScreen from './LoginActionScreen';


const GQNonFsfActionScreen = () => {
  return (
    <LoginActionScreen
      apiUrl={`/loan-booking/login-loans?table=loan_booking_gq_non_fsf&prefix=GQN`}
      title="GQ Non FSF Action Pending Loans"
      tableName="loan_booking_gq_non_fsf"
    />
  );
}

export default GQNonFsfActionScreen