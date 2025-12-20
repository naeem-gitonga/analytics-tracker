require('dotenv').config();

exports.setStage = async function () {
  return process.env.STAGE;
};
