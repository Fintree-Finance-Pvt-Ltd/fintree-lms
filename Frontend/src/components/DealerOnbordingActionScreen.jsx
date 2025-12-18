import React from 'react'
import LoginActionScreen from './LoginActionScreen';


const DealerOnbordingActionScreen = () => {
  return (
    <LoginActionScreen
      apiUrl={`/loan-booking/login-loans?table=dealer_onboarding&prefix=DLR`}
      title="Dealer Action Pending Loans"
      tableName="dealer_onboarding"
    />
  );
}

export default DealerOnbordingActionScreen;