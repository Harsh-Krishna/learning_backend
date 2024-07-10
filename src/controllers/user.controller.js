import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { User } from "../models/user.model.js";
import { uploadOnCloudinary } from "../utils/cloudinary.js";
import {ApiResponse} from "../utils/ApiResponse.js"

// const registerUser = asyncHandler(async(req,res)=>{
//     res.status(200).json({
//         message:"Ok"
//     })
// })

const generateAccessAndRefreshTokens = async(userId)=>{
  try {
    const user = await User.findById(userId);
    const accesssToken = user.generateAccessToken();
    const refreshToken = user.generateRefreshToken();

    user.refreshToken = refreshToken;

    await user.save({validateBeforeSave:false});

    return {accesssToken,refreshToken};
  } catch (error) {
    throw new ApiError(500,"Something went wrong while generating refresh and access token");
  }
}

const registerUser = asyncHandler(async (req, res) => {
  //get user details from frontend
  //validation - not empty
  //check if user already exists : username,email
  //check for image , check for avatar
  //upload them to cloudinary , avatar
  //create user object - create entry in db
  //remove password and refresh token field from response
  //check for user creation
  // return res

  const { fullName, email, username, password } = req.body;
  console.log("Email : ",fullName, email, username, password);
  console.log(req.body);

  // if(fullName===""){
  //     throw new ApiError(400,"all fields are required")
  // }

  if ([fullName, email, username, password].some((field) => field?.trim() === "")) {
    throw new ApiError(400, "All fields are required");
  }
  

  const existedUser =await User.findOne({
    $or: [{ username }, { email }],
  });

  if (existedUser) {
    throw new ApiError(409, "user with email or username already exists");
  }

  const avatarLocalPath = req.files?.avatar[0]?.path;

  console.log("files",req.files);

  console.log("local : ",avatarLocalPath)

  // const coverImageLocalPath = req.files?.coverImage[0]?.path;

  let coverImageLocalPath ;
  if(req.files && Array.isArray(req.files.coverImage) && req.files.coverImage.length>0){
    coverImageLocalPath = req.files.coverImage[0].path;
  }


  if (!avatarLocalPath) {
    throw new ApiError(400, "Avatar file is required");
  }


  //uploaded to cloudinary
  const avatar = await uploadOnCloudinary(avatarLocalPath);

  const coverImage =  await uploadOnCloudinary(coverImageLocalPath);

  console.log("cloudinary avatar : " , avatar);
  //check avatar
  if (!avatar) {
    throw new ApiError(400, "Avatar file is required");
  }

  //entry to database
  const user = await User.create({
    fullName,
    avatar: avatar.url,
    coverImage: coverImage?.url || "",
    email,
    password,
    username: username.toLowerCase(),
  });

  //whether user created or not
  const createdUser = await User.findById(user._id).select(
    "-password -refreshToken"                            //to remove them
  )

  if(!createdUser){
    throw new ApiError(500,"Something went wrong while registering the user");
  }

  //retrun response
  return res.status(201).json(
    new ApiResponse(200,createdUser,"user registered successfully")
  )
});

const loginUser = asyncHandler(async(req,res)=>{
  // req body -> data
  // username or email 
  // find the user
  // password check
  // access and refresh token
  // send cookie
  // response

  const {username,email,password} = req.body;

  if(!username || !email){
    throw new ApiError(400,"username or email is required");
  }

  const user = await User.findOne({
    $or : [{username},{email}]
  })

  if(!user){
    throw new ApiError(404,"user does not exists");
  }

  const isPasswordValid = await user.isPasswordCorrect(password);

  if(!isPasswordValid){
    throw new ApiError(401,"Invalid user Credentials");
  }

  const {accesssToken,refreshToken} = await generateAccessAndRefreshTokens(user._id);

  const loggedInUser = await User.findById(user._id).select("-password -refreshToken")

  const options = {
    httpOnly : true,
    secure : true,
  }

  return res.status(200).cookie("accessToken",accesssToken,options).cookie("refreshToken",refreshToken,options)
            .json(
              new ApiResponse(
                200,
                {
                  user:loggedInUser,accesssToken,refreshToken
                },
                "User logged in successfully"
              )
            )
})

const logoutUser = asyncHandler(async(req,res)=>{
  await User.findByIdAndUpdate(
    req.user._id,
    {
      $set: {
        refreshToken : undefined,
      }
    },
    {
      new:true,
    }
  )

  const options = {
    httpOnly : true,
    secure : true,
  }

  return res.status(200).clearCookie("accessToken",options).clearCookie("refreshToken",options)
            .json(new ApiResponse(200,{},"user logged out"));
})

export { registerUser,loginUser ,logoutUser};
