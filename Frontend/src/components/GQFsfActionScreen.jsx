import React from 'react'
import LoginActionScreen from './LoginActionScreen';


const GQFsfActionScreen = () => {
  return (
    <LoginActionScreen
      apiUrl={`/loan-booking/login-loans?table=loan_booking_gq_fsf&prefix=GQF`}
      title="GQ FSF Action Pending Loans"
      tableName="loan_booking_gq_fsf"
    />
  );
}

export default GQFsfActionScreen